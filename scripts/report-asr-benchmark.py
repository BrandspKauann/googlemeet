"""Summarize measured cases without treating formatting differences as semantic accuracy."""
import json
from pathlib import Path
root=Path(__file__).resolve().parent.parent
source=root/'data/qa/bench/comparison.json'
rows=json.loads(source.read_text('utf-8'))
models={row['model'] for row in rows}
lines=['# Comparação local de transcrição','',
       'Amostras sintéticas Windows TTS; uma execução de aquecimento e três medições por caso. CPU int8, quatro threads. Não há avaliação de voz humana ou espanhol neste conjunto.',
       '', '| Modelo | Amostra | Erro bruto médio | Processamento mediano | RTF |',
       '|---|---|---:|---:|---:|']
for row in rows:
    error=sum(row['errorRates'])/len(row['errorRates'])
    lines.append(f"| {row['model']} | {row['case']} | {row['metric']} {error:.1%} | {row['medianProcessingSeconds']:.3f}s | {row['realTimeFactor']:.3f} |")
lines+=['','RTF abaixo de 1 significa processamento mais rápido que a duração do arquivo neste teste; não inclui espera pela pausa, tradução, rede ou concorrência com videochamada.',
        '', 'WER/CER removem pontuação e maiúsculas, mas contam números por extenso versus dígitos e escrita chinesa tradicional versus simplificada. Essas diferenças não demonstram necessariamente erro de significado.','',
        'Modelos ainda sem medições: '+(', '.join(model for model in ['base','small','turbo'] if model not in models) or 'nenhum')+'.',
        '', 'Whisper no navegador/WebGPU: o build e o fluxo foram testados por código, mas a execução real não foi confirmada aqui. A primeira abertura direta foi bloqueada; a navegação pelo link da sala funcionou e mostrou download em andamento. O primeiro download falhou com erro de rede; a versão com recuperação de partes voltou a mostrar progresso. O perfil fp16/q4 permanece experimental e exige validação sintética durante a preparação no dispositivo.',
        '', 'Não há evidência suficiente para declarar superioridade geral ou trocar o padrão do serviço local. Use WHISPER-NAVEGADOR.md para comparar sua voz.']
(root/'benchmarks/RESULTADOS.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
