# ZPI documentation

HomeSplit project documentation in LaTeX, based on the [ZPI documentation template](https://wit.pwr.edu.pl/d/oGBUKOTtQKxVvAU1oREFBPF0WUXJ-VFtOSylDC0QHFm9PFQk5Eht1FRMSWHoFPFgHFkhCfn5aXlJfOA/zpi_szablon_dokumentacji-1.docx).

| File | Contents |
| --- | --- |
| `main.tex` | title page data and the list of sections |
| `zpi.sty` | formatting that follows the template |
| `sections/` | sections 1–9 |
| `references.bib` | bibliography |
| `figures/` | figures |
| `figures/bpmn/` | BPMN diagrams: `.bpmn` sources and their PDF exports |

## Building

Building requires LuaLaTeX and Biber, for example from the MacTeX distribution (`brew install --cask mactex-no-gui`).

```bash
cd docs/documentation && latexmk
```

`latexmk -c` removes the auxiliary files.

In VS Code or Cursor, the LaTeX Workshop extension rebuilds the PDF on every save. On Overleaf, set *Menu → Compiler → LuaLaTeX*.

## Common commands

| Purpose | Command |
| --- | --- |
| Cite a source from `references.bib` | `\cite{key}` |
| Insert a figure from `figures/` | `\includegraphics{name}` |
| Label a figure or table | `\label{fig:name}` |
| Reference a label in the text | `\ref{fig:name}` |
