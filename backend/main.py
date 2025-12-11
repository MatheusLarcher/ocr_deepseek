import os
import base64
import tempfile
from pathlib import Path
from typing import Optional

import httpx
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pdf2image import convert_from_bytes
from PIL import Image
import io

app = FastAPI(title="DeepSeek OCR API", version="1.0.0")

# CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")


def image_to_base64(image: Image.Image, format: str = "PNG", quality: int = 85) -> str:
    """Convert PIL Image to base64 string."""
    buffer = io.BytesIO()
    if format.upper() == "JPEG":
        image.save(buffer, format=format, quality=quality, optimize=True)
    else:
        image.save(buffer, format=format, optimize=True)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def image_to_base64_for_preview(image: Image.Image, max_width: int = 1200) -> str:
    """Convert PIL Image to base64 JPEG for preview (smaller size)."""
    # Resize if too large
    if image.width > max_width:
        ratio = max_width / image.width
        new_height = int(image.height * ratio)
        image = image.resize((max_width, new_height), Image.Resampling.LANCZOS)
    
    # Convert to RGB if necessary
    if image.mode in ("RGBA", "P"):
        image = image.convert("RGB")
    
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=75, optimize=True)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


async def run_ocr_on_image(image_base64: str, prompt: str = "Extract the text in the image.") -> str:
    """Call Ollama deepseek-ocr model with an image."""
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": "deepseek-ocr",
                    "prompt": prompt,
                    "images": [image_base64],
                    "stream": False,
                },
            )
            response.raise_for_status()
            result = response.json()
            return result.get("response", "")
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Ollama error: {e.response.text}")
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Cannot connect to Ollama: {str(e)}")


@app.get("/health")
async def health_check():
    """Check if the API and Ollama are available."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            response.raise_for_status()
            models = response.json().get("models", [])
            has_deepseek_ocr = any("deepseek-ocr" in m.get("name", "") for m in models)
            return {
                "status": "healthy",
                "ollama": "connected",
                "deepseek_ocr_available": has_deepseek_ocr,
            }
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "ollama": "disconnected", "error": str(e)},
        )


@app.post("/ocr/image")
async def ocr_image(
    file: UploadFile = File(...),
    prompt: str = Form(default="Extract the text in the image."),
    dpi: int = Form(default=200),
):
    """Perform OCR on a single image file."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    content = await file.read()
    image = Image.open(io.BytesIO(content))
    
    # Convert to RGB if necessary
    if image.mode in ("RGBA", "P"):
        image = image.convert("RGB")
    
    # Scale image based on DPI (reference: 200 DPI as baseline)
    # Higher DPI = larger image for better OCR on small text
    if dpi != 200:
        scale_factor = dpi / 200
        new_width = int(image.width * scale_factor)
        new_height = int(image.height * scale_factor)
        # Limit max size to avoid memory issues
        max_dimension = 4096
        if new_width > max_dimension or new_height > max_dimension:
            ratio = min(max_dimension / new_width, max_dimension / new_height)
            new_width = int(new_width * ratio)
            new_height = int(new_height * ratio)
        image_for_ocr = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
    else:
        image_for_ocr = image
    
    image_base64 = image_to_base64(image_for_ocr, "PNG")
    text = await run_ocr_on_image(image_base64, prompt)
    
    # Generate preview image (from original, not scaled)
    preview_base64 = image_to_base64_for_preview(image)
    
    return {
        "filename": file.filename,
        "text": text,
        "image": f"data:image/jpeg;base64,{preview_base64}",
    }


@app.post("/ocr/pdf")
async def ocr_pdf(
    file: UploadFile = File(...),
    prompt: str = Form(default="Extract the text in the image."),
    dpi: int = Form(default=200),
):
    """Perform OCR on a PDF file, processing each page."""
    if not file.content_type or file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="File must be a PDF")

    content = await file.read()
    
    try:
        # Convert PDF pages to images
        images = convert_from_bytes(content, dpi=dpi)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process PDF: {str(e)}")

    results = []
    for i, image in enumerate(images):
        # Convert to RGB if necessary
        if image.mode in ("RGBA", "P"):
            image = image.convert("RGB")
        
        image_base64 = image_to_base64(image, "PNG")
        text = await run_ocr_on_image(image_base64, prompt)
        
        # Generate preview image for this page
        preview_base64 = image_to_base64_for_preview(image)
        
        results.append({
            "page": i + 1,
            "text": text,
            "image": f"data:image/jpeg;base64,{preview_base64}",
        })

    return {
        "filename": file.filename,
        "total_pages": len(images),
        "pages": results,
    }


@app.post("/ocr/batch")
async def ocr_batch(
    files: list[UploadFile] = File(...),
    prompt: str = Form(default="Extract the text in the image."),
    dpi: int = Form(default=200),
):
    """Process multiple files (PDFs or images) in batch."""
    results = []
    
    for file in files:
        try:
            if file.content_type == "application/pdf":
                content = await file.read()
                images = convert_from_bytes(content, dpi=dpi)
                
                pages = []
                for i, image in enumerate(images):
                    if image.mode in ("RGBA", "P"):
                        image = image.convert("RGB")
                    image_base64 = image_to_base64(image, "PNG")
                    text = await run_ocr_on_image(image_base64, prompt)
                    pages.append({"page": i + 1, "text": text})
                
                results.append({
                    "filename": file.filename,
                    "type": "pdf",
                    "total_pages": len(images),
                    "pages": pages,
                    "success": True,
                })
            elif file.content_type and file.content_type.startswith("image/"):
                content = await file.read()
                image = Image.open(io.BytesIO(content))
                
                if image.mode in ("RGBA", "P"):
                    image = image.convert("RGB")
                
                image_base64 = image_to_base64(image, "PNG")
                text = await run_ocr_on_image(image_base64, prompt)
                
                results.append({
                    "filename": file.filename,
                    "type": "image",
                    "text": text,
                    "success": True,
                })
            else:
                results.append({
                    "filename": file.filename,
                    "type": "unknown",
                    "success": False,
                    "error": "Unsupported file type",
                })
        except Exception as e:
            results.append({
                "filename": file.filename,
                "success": False,
                "error": str(e),
            })
    
    return {"results": results}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
