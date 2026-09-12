# Bloco de Notas

Bloco de notas offline, feito em HTML, CSS e JavaScript puro (sem frameworks, sem dependências externas, sem necessidade de internet).

## Estrutura

- `index.html` — estrutura das telas (lista, editor, configurações, lixeira, menu lateral).
- `style.css` — sistema visual (cores, tipografia, temas claro/escuro).
- `app.js` — toda a lógica: armazenamento, navegação, edição, busca, organização, exportação/importação.
- `manifest.json` — permite instalar o app na tela inicial do celular (PWA).
- `sw.js` — cache do app para funcionar offline quando hospedado em um servidor (GitHub Pages, etc.).
- `icon.svg` — ícone do app.

## Como usar

- **Direto do celular:** abra `index.html` em qualquer navegador. Já funciona por completo, offline, sem instalar nada.
- **Como app instalável (PWA):** hospede a pasta em qualquer servidor estático (GitHub Pages, Termux com `python -m http.server`, etc.) e abra pelo navegador — vai aparecer a opção "Adicionar à tela inicial". Isso ativa o cache offline do `sw.js`. Ao abrir localmente com `file://`, o app funciona normalmente, só o service worker (cache extra) não é registrado — isso é uma limitação do próprio navegador, não do app.

## Onde os dados ficam

Tudo é salvo no `localStorage` do navegador, neste dispositivo. Não há conta, servidor ou coleta de dados.

## Funcionalidades implementadas

- Criar, editar e excluir anotações, com título e conteúdo formatado.
- Salvamento automático (ativável/desativável) + botão "Salvar" explícito.
- Data de criação e de última alteração em cada anotação.
- Identificador único por anotação.
- Lista principal ordenada por última alteração, criação ou ordem alfabética.
- Anotações sem título aparecem como "Sem título".
- Pesquisa em tempo real por título e conteúdo, com mensagem de "nenhuma anotação encontrada".
- Favoritar e fixar anotações (fixadas aparecem no topo da lista).
- Filtros dedicados: Todas, Favoritas, Fixadas.
- Arquivar e restaurar anotações (seção "Arquivadas").
- Lixeira: exclusão não é definitiva — dá para restaurar ou excluir para sempre (com confirmação).
- Formatação de texto: negrito, itálico, sublinhado, títulos, listas com marcadores e numeradas, links, quebras de linha.
- Compartilhamento usando o recurso nativo do celular (ou cópia para a área de transferência como alternativa).
- Tema claro, escuro ou seguindo o sistema.
- Configurações: tema, confirmação antes de excluir, salvamento automático, ordenação padrão, acesso rápido à lixeira e às arquivadas.
- Exportar todas as anotações para um arquivo `.json` e importar de volta, com confirmação antes de sobrescrever anotações existentes.
- Funciona 100% offline, sem conta e sem internet.
- Menu lateral para navegar entre Todas, Favoritas, Fixadas, Arquivadas, Lixeira e Configurações.
- Identidade visual própria: paleta "tinta sobre papel", tipografia serifada para leitura/escrita e sem elementos genéricos de outros apps.
