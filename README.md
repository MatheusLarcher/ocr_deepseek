# DeepSeek OCR

Aplicação web para extração de texto de PDFs e imagens usando o modelo DeepSeek-OCR via Ollama.

## Screenshots

### Exemplos de Uso
![Exemplos de prompts e resultados](frontend/public/examples.jpg)

### Conversão de Documentos para Markdown
![Parsing de documentos](frontend/public/document-parsing.jpg)

### Parsing de Figuras Matemáticas
![Parsing de figuras matemáticas](frontend/public/math-parsing.jpg)

### Análise de Relatórios Financeiros
![Análise de relatórios](frontend/public/financial-report.jpg)

### Benchmark de Performance
![Benchmark](frontend/public/benchmark.png)

## Pré-requisitos

1. **Ollama v0.13.0+** instalado e rodando
2. **Modelo deepseek-ocr** baixado:
   ```bash
   ollama pull deepseek-ocr
   ```
3. **Python 3.10+** para o backend
4. **Node.js 18+** para o frontend
5. **Poppler** (necessário para converter PDFs em imagens)
   - Windows: Baixe de https://github.com/oschwartz10612/poppler-windows/releases e adicione ao PATH
   - Linux: `sudo apt install poppler-utils`
   - macOS: `brew install poppler`

## Instalação

### Backend

```bash
cd backend
pip install -r requirements.txt
```

### Frontend

```bash
cd frontend
npm install
```

## Executando

### 1. Inicie o Ollama (se não estiver rodando)

```bash
ollama serve
```

### 2. Inicie o Backend

```bash
cd backend
python main.py
```

O backend estará disponível em `http://localhost:8000`

### 3. Inicie o Frontend

```bash
cd frontend
npm run dev
```

O frontend estará disponível em `http://localhost:5173`

## Uso

1. Abra `http://localhost:5173` no navegador
2. Arraste ou selecione arquivos PDF ou imagens
3. Configure o prompt desejado (opcional)
4. Clique em "Processar"
5. Visualize, copie ou baixe os resultados

## Prompts Disponíveis

| Prompt | Descrição |
|--------|-----------|
| `Extract the text in the image.` | Extração básica de texto |
| `Free OCR.` | OCR livre |
| `<\|grounding\|>Convert the document to markdown.` | Converte para Markdown |
| `<\|grounding\|>Given the layout of the image.` | Analisa o layout |
| `Parse the figure.` | Parseia figuras/gráficos |

## API Endpoints

- `GET /health` - Verifica status da API e Ollama
- `POST /ocr/image` - OCR em uma imagem
- `POST /ocr/pdf` - OCR em um PDF (processa todas as páginas)
- `POST /ocr/batch` - Processa múltiplos arquivos

## Estrutura do Projeto

```
ocr_deepseek/
├── backend/
│   ├── main.py           # API FastAPI
│   └── requirements.txt  # Dependências Python
├── frontend/
│   ├── src/
│   │   ├── App.tsx       # Componente principal
│   │   ├── main.tsx      # Entry point
│   │   └── lib/utils.ts  # Utilitários
│   ├── package.json
│   └── ...
└── README.md
```
