# Everton OS

Portfólio pessoal que roda no navegador como um sistema operacional: no computador, um desktop estilo Linux com janelas gerenciadas pelo [WinBox.js](https://github.com/nextapps-de/winbox); no celular, uma tela inicial inspirada no iOS. Os apps são os mesmos componentes React nas duas interfaces; só a moldura muda.

## Rodando

```bash
pnpm install
pnpm dev      # http://localhost:5173
pnpm build    # gera dist/, incluindo a versão clássica
pnpm lint
pnpm test     # testes do sistema de arquivos (vitest + fake-indexeddb)
```

## Editando o currículo

Todo o conteúdo sai de **`src/data/curriculo.json`** (formato baseado no [JSON Resume](https://jsonresume.org/)).

- Textos que mudam com o idioma são objetos `{ "pt": "…", "en": "…" }`; os demais são strings simples.
- `basics.image`: caminho de uma foto dentro de `public/` (ex.: `"media/foto.jpg"`) ou uma URL. Sem foto, aparecem as iniciais.
- `basics.intro`: versão de duas frases do resumo, usada no app Sobre mim. Sem ela, o app mostra `basics.summary` inteiro.
- Imagens (`projects[].images`, `photos`, `certificates[].image`): `src` é um caminho dentro de `public/` ou uma URL. Sem `src`, é desenhado um placeholder.
- `projects[].demo`: endereço que o app Navegador abre dentro de uma janela.
- `projects[].repos`: repositórios do projeto (`{ "url": "…" }`). Quando há mais de um, `label` os diferencia (`"backend"`, `"mobile"`): vira o sufixo do arquivo `.url` e aparece ao lado do link.
- `meta.pdf`: caminhos dos PDFs do currículo dentro de `public/`, um por idioma (ex.: `{ "pt": "files/curriculo.pdf", "en": "files/resume.pdf" }`). Com `null`, o Visualizador desenha o currículo a partir dos dados e o botão vira "Salvar em PDF" (impressão da versão clássica).
- `meta.bookmarks`: sites que o Navegador pode abrir em iframe. A maioria dos grandes sites bloqueia isso; só inclua os que funcionam.

Os textos da interface (botões, mensagens do terminal) ficam em `src/i18n/dict.ts`; o nome de cada app fica no manifesto dele.

## Como está organizado

```
src/
  data/        curriculo.json, tipos e a função que resolve o idioma
  i18n/        textos da interface em pt e en
  sdk/         a API pública: o único lugar de onde os apps importam o sistema
  system/      o que os dois shells compartilham: registro de apps, associações
               por tipo de arquivo, processos, configurações
    vfs/       o sistema de arquivos virtual (caminhos, inodes, drivers)
  shells/
    desktop/   boot, login, área de trabalho, painel, menu e janelas
    mobile/    tela de bloqueio, tela inicial, dock e apps em tela cheia
  apps/        uma pasta por app (manifesto + componente); cada um vira um chunk
  components/  peças usadas por vários apps
  styles/      tokens de tema e estilos dos apps
classic/       gerador da versão clássica (HTML estático, sem JavaScript)
```

Pontos que valem conhecer:

- **`shells/desktop/useWindow.ts`** é o único arquivo que importa o WinBox. O resto do código fala com esse hook, então dá para fazer fork da biblioteca ou trocá-la sem mexer nos apps.
- **Para criar um app**, basta criar a pasta `src/apps/<id>/` com dois arquivos e mais nada:
  - `manifest.ts`: `export default defineApp({ id, name: { pt, en }, icon, tint, window, order, handles, entry: () => import('./MeuApp.tsx') })`. O componente só pode entrar pelo `entry` (import dinâmico), para continuar num chunk próprio.
  - o componente, com `export default`. Ele recebe `args` (`files`, `url`, `argv`).

  `system/apps.ts` descobre os manifestos sozinho (`import.meta.glob`), e o app aparece no menu do desktop e na tela inicial do celular. `handles` diz que tipos de arquivo ele abre (`['text/*']`, `['image/*']`) e que esquemas de URL (`['https']`); o mais específico vira o padrão e os outros aparecem em "Abrir com…".
- **`src/sdk/index.ts`** é a única coisa que um app importa do sistema: `useOS()` (arquivos em `os.fs`, `os.exec`, `os.openFile`, `os.openUrl`, `os.dialog`), `useAppWindow()`, `useLaunchArgs()` e o resto. Uma regra do `oxlint` falha se um arquivo de `src/apps/` importar de `src/system/` ou `src/shells/`. Cada shell fornece a sua parte do sistema (`exec`, `kill`, janelas); o sistema de arquivos e a abertura de arquivos são os mesmos.
- **`system/vfs/`** é o sistema de arquivos, em camadas como num sistema de verdade: a árvore (dentries) só diz onde cada coisa está, os inodes dizem o que ela é, e os drivers guardam os dados. Na raiz há um overlay: embaixo o `resumefs`, somente leitura e gerado do currículo; em cima o `idbfs`, com os arquivos do visitante no IndexedDB (ou o `memfs`, em memória, quando o IndexedDB está bloqueado). Os nomes reais são fixos e os nomes mostrados (`displayName`) seguem o idioma, como no macOS; o Terminal mostra os reais. Os atalhos do desktop são symlinks e lançadores (`terminal.app`), e a Lixeira segue o modelo freedesktop em `/.trash`.
- Os arquivos do visitante ficam só no navegador dele. O Safari pode apagar o IndexedDB de um site depois de alguns dias sem visita, e no modo privado eles duram até a aba fechar. Num portfólio, tudo bem.
- **`classic/`** é um plugin do Vite que gera `classic/index.html` (pt) e `classic/en/index.html` (en) no build, a partir do mesmo `curriculo.json`. É a saída rápida para quem tem pressa, para leitores de tela e para buscadores.

Qual interface carrega é decidido em `src/App.tsx`: telas pequenas ou com toque recebem a do celular.

## Deploy

O build usa caminhos relativos (`base: './'`), então funciona tanto em `https://<usuario>.github.io/everton-os/` quanto em um domínio próprio.

O workflow `.github/workflows/deploy.yml` publica no GitHub Pages a cada push na `main`. Para ativar: no repositório, **Settings → Pages → Source: GitHub Actions**.

## Atalhos

- `Super` abre o menu; `Alt+Tab` (ou `` Alt+` ``) alterna janelas. Como o sistema operacional de verdade costuma capturar essas teclas, elas só chegam ao site em tela cheia (botão no painel, navegadores Chromium). `` Alt+` `` funciona sempre.
- `?lang=en` ou `?lang=pt` na URL força o idioma.
