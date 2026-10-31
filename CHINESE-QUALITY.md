# Reconhecimento, tradução e filtro — 30/10/2026

## Onde cada etapa executa

- Reconhecimento pt/zh/en/es: Whisper large-v3, CUDA int8_float16, no Docker.
- Tradução envolvendo zh: Tencent Hy-MT2-1.8B Q8_0, CPU, no Docker, diretamente
  entre os idiomas. Sem ponte pelo inglês. Argos permanece para os demais pares.
- Filtro combinado Porcelana: navegador. Ao ligar a câmera pela primeira vez,
  prepara e guarda os recursos no Cache Storage. A chamada usa o vídeo original
  durante o download. Não há upload da câmera para um servidor de beleza.

O usuário não baixa modelos de voz ou tradução. Os recursos visuais são locais.
O cache pode ser removido pelo navegador/usuário; nesse caso há novo download.
O botão manual de download foi ocultado. Download parcial retoma só os arquivos
faltantes. Modelo facial, runtime e assets agora vêm do próprio site; o modelo
facial tem SHA256 fixado no build. A versão imutável do runtime deve ser alterada
se a biblioteca for atualizada. O cache não torna o site inteiro offline.

## Modelo de tradução

Pesos oficiais: https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF
Licença Apache-2.0. Revisão, hash e arquivo em `hy-translation-model.json`.
Preparação: `python scripts/prepare-hy-model.py`. O script de início da GPU também
faz essa preparação. O volume de pesos é somente leitura; a porta do tradutor
não é publicada. Autenticação interna usa a mesma chave privada do serviço.
Logs de contêiner do tradutor estão desabilitados; os prompts não são gravados.
Há timeout e rejeição de saída truncada, sem troca silenciosa para Argos em zh.
O original continua preservado se a tradução falhar. Textos longos são divididos
em solicitações de até 160 caracteres no site e reunidos no resultado.

Llama.cpp está fixado por digest no Compose. Usa CPU para preservar a GPU do
Whisper e da videochamada. Não houve alteração de drivers.

## Evidência e limites

Seis frases sintéticas de aula, pt→zh e zh→pt, em
`benchmarks/HY-MT2-20261030.json`: 0,85 a 1,37 segundo por frase com o modelo
carregado. Preservou meses/anos e o termo “carro” na pergunta sobre letras.
Isso é uma avaliação pequena, não prova de melhor modelo global nem garantia
para frases longas, todos os sotaques ou vozes reais. Whisper permanece o melhor
entre os modelos medidos neste computador no relatório anterior; Qwen3-ASR não
foi medido nem instalado. A espera de seis segundos de pausa continua ativa.

65 testes Node e 6 Python passaram. Chrome descartável com câmera sintética:
filtro ativo com movimento; após recarregar no mesmo perfil, nenhum peso/asset
pesado foi baixado novamente. Cache Storage e runtime permanecem no dispositivo.
