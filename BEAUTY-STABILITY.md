# Estabilidade da câmera com filtro — 31/10/2026

O debug reproduziu vídeo entrecortado, não um congelamento permanente, no
Chrome com câmera sintética de 24 fps. O limitador esperava um intervalo
completo a partir de cada quadro aceito e descartava quadros demais. Além
disso, duas inferências faciais síncronas disputavam o tempo da renderização,
e o quadro físico da câmera ficava retido até a entrega da saída.

## Correção

- Cadência de saída baseada em prazos, preservando 20 fps com fontes de 24/30 fps.
- Um detector facial compartilhado pelos efeitos de pele e maquiagem, em Worker
  separado. A renderização usa o resultado mais recente e nunca aguarda inferência.
- No máximo um bitmap de rastreamento pendente. Quadros físicos da câmera são
  liberados logo após a cópia de entrada, antes do processamento e da espera pela saída.
- Redução gradual da resolução quando o custo de renderização permanece alto,
  mantendo os efeitos combinados e o preset Porcelana.
- Proteção baseada na entrega real dos quadros: após 2,5 segundos sem saída,
  restaura a câmera original e avisa que o filtro foi interrompido.

O filtro continua no navegador, com download automático e cache existentes.
Transcrição e tradução no servidor não foram alteradas.

## Validação

Chrome descartável, câmera sintética com movimento, sem câmera pessoal:

| Cenário | Antes | Depois |
| --- | --- | --- |
| NVIDIA D3D11, câmera 24 fps | média 12,8 fps | aproximadamente 20 fps |
| Renderização por software | média 9,7 fps | média 19,6 fps após adaptação para 384×288 |

São medições locais com vídeo sintético, não garantia de desempenho em todos
os computadores. O rastreamento foi artificialmente atrasado em 600 ms por
inferência para verificar que não bloqueia a saída de vídeo.

Uma sala de teste com professora e aluno verificou via WebRTC oito imagens
distintas em oito amostras, com ajustes abertos e fechados, inclusive com
timestamps repetidos na câmera. Ao interromper deliberadamente o Worker,
a câmera original voltou em 2.689 ms e continuou em movimento. O aviso de
VideoFrame no console nessa interrupção forçada é esperado; o encerramento
normal usa o protocolo de liberação dos quadros.

66 testes Node passaram, incluindo a regressão da cadência e a recuperação
quando o Worker responde sem entregar novos quadros.
