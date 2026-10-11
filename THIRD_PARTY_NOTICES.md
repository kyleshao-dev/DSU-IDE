# Third-party notices

DSU IDE is a distribution layer for [Code OSS](https://github.com/microsoft/vscode), licensed under MIT by Microsoft Corporation. The upstream source, license, notices, and resources are retained in `vendor/code-oss` during preparation. They must accompany distributions as required by their licenses.

`src/extension/vscode.proposed.browser.d.ts` is copied from the pinned Microsoft VS Code commit in `config/upstream.json`; its original copyright header is preserved. It is licensed under MIT; see [the upstream license](https://github.com/microsoft/vscode/blob/067c1c2b93989930185121fefb58830c54d2a4dd/LICENSE.txt).

The name “Visual Studio Code” and Microsoft marketplace services are not provided under this project's MIT license. DSU uses Code OSS source, its own product identity, and disables the gallery service. Do not redistribute Microsoft's branded binaries as DSU IDE.

Bundled build and test dependencies retain their respective licenses in their packages. Browser and IDE output contains DSU source; esbuild preserves required legal comments.

The bundled Simplified Chinese translations in `resources/vscode-language-pack-zh-hans` come from [microsoft/vscode-loc](https://github.com/microsoft/vscode-loc/tree/0f157dee0cdcbf58cdf51a221ee94751c7f35e75), commit `0f157dee0cdcbf58cdf51a221ee94751c7f35e75`, under MIT. The original license and source provenance are included alongside the translations.
