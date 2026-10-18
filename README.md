# Everton OS

Portfólio pessoal que roda no navegador como um sistema operacional: no computador, um desktop estilo Linux com janelas gerenciadas pelo [WinBox.js](https://github.com/nextapps-de/winbox); no celular, uma tela inicial inspirada no iOS. Os apps são os mesmos componentes React nas duas interfaces; só a moldura muda.

## Rodando

```bash
pnpm install
pnpm dev      # http://localhost:5173
pnpm build    # gera dist/, incluindo a versão clássica
pnpm lint
```

## Editando o currículo

Todo o conteúdo sai de **`src/data/curriculo.json`** (formato baseado no [JSON Resume](https://jsonresume.org/)).

- Textos que mudam com o idioma são objetos `{ "pt": "…", "en": "…" }`; os demais são strings simples.
- `basics.image`: caminho de uma foto dentro de `public/` (ex.: `"media/foto.jpg"`) ou uma URL. Sem foto, aparecem as iniciais.
- `basics.intro`: versão de duas frases do resumo, usada no app Sobre mim. Sem ela, o app mostra `basics.summary` inteiro.
- Imagens (`projects[].images`, `photos`, `certificates[].image`): `src` é um caminho dentro de `public/` ou uma URL. Sem `src`, é desenhado um placeholder.
- `projects[].demo`: endereço que o app Navegador abre dentro de uma janela.
- `meta.pdf`: caminhos dos PDFs do currículo dentro de `public/`, um por idioma (ex.: `{ "pt": "files/curriculo.pdf", "en": "files/resume.pdf" }`). Com `null`, o Visualizador desenha o currículo a partir dos dados e o botão vira "Salvar em PDF" (impressão da versão clássica).
- `meta.bookmarks`: sites que o Navegador pode abrir em iframe. A maioria dos grandes sites bloqueia isso; só inclua os que funcionam.

Os textos da interface (nomes de apps, botões, mensagens do terminal) ficam em `src/i18n/dict.ts`.

## Como está organizado

```
src/
  data/        curriculo.json, tipos e a função que resolve o idioma
  i18n/        textos da interface em pt e en
  system/      o que os dois shells compartilham: registro de apps, sistema de
               arquivos virtual, configurações (tema, papel de parede, idioma)
  shells/
    desktop/   boot, login, área de trabalho, painel, menu e janelas
    mobile/    tela de bloqueio, tela inicial, dock e apps em tela cheia
  apps/        um arquivo por app; cada um vira um chunk carregado sob demanda
  components/  peças usadas por vários apps
  styles/      tokens de tema e estilos dos apps
classic/       gerador da versão clássica (HTML estático, sem JavaScript)
```

Pontos que valem conhecer:

- **`shells/desktop/useWindow.ts`** é o único arquivo que importa o WinBox. O resto do código fala com esse hook, então dá para fazer fork da biblioteca ou trocá-la sem mexer nos apps.
- **`system/apps.ts`** é o registro de apps. Para criar um app: escreva o componente em `src/apps/`, registre-o ali e adicione o nome em `i18n/dict.ts`. Ele aparece no menu do desktop e na tela inicial do celular.
- **`system/os.ts`** define o que um app pode pedir ao sistema (`useOS().open(...)`, `useAppWindow().setTitle(...)`). Cada shell fornece a sua implementação.
- **`system/fs.ts`** gera a árvore de pastas e arquivos a partir do currículo. Arquivos, Visualizador, Galeria e Terminal leem dela.
- **`classic/`** é um plugin do Vite que gera `classic/index.html` (pt) e `classic/en/index.html` (en) no build, a partir do mesmo `curriculo.json`. É a saída rápida para quem tem pressa, para leitores de tela e para buscadores.

Qual interface carrega é decidido em `src/App.tsx`: telas pequenas ou com toque recebem a do celular.

## Deploy

O build usa caminhos relativos (`base: './'`), então funciona tanto em `https://<usuario>.github.io/everton-os/` quanto em um domínio próprio.

O workflow `.github/workflows/deploy.yml` publica no GitHub Pages a cada push na `main`. Para ativar: no repositório, **Settings → Pages → Source: GitHub Actions**.

## Atalhos

- `Super` abre o menu; `Alt+Tab` (ou `` Alt+` ``) alterna janelas. Como o sistema operacional de verdade costuma capturar essas teclas, elas só chegam ao site em tela cheia (botão no painel, navegadores Chromium). `` Alt+` `` funciona sempre.
- `?lang=en` ou `?lang=pt` na URL força o idioma.
