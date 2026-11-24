# Guia de teste da extensão (loja de teste)

Use uma **loja de teste**, de preferência recém-criada ou limpa (Avançado → Limpar a loja).

## Parte 1: criar tudo (`teste-completo.json`)

1. Abra o editor da loja de teste e clique em **Exportar**.
2. Cole o conteúdo de `teste-completo.json` na caixa de colagem, clique **Ver mudanças**, confira e **Aplicar**.

O que a parte 1 cria e o que conferir:

| O que | Onde conferir |
|---|---|
| 9 grupos novos, com "mostrar título do grupo" ligado | editor da plataforma |
| Itens de bebida, hambúrguer, pizza, açaí, combos | editor |
| 6 grupos de complementos (Tamanho da Pizza, Tamanho Açaí, Extras, Ponto da Carne, Adicionais, Grupo para Apagar) ligados aos itens | editor, em cada item |
| Itens +18 marcados (`is_alcohol`) | grupos "Bebidas +18" e "Verificação +18" |
| Avisos +18 na revisão: **Cachaça** e **Gin Tônica** sem a marca, **Cerveja Sem Álcool** com a marca | caixa de avisos da revisão |
| Imagens externas e banner por link | grupos "Imagem Externa" e "Banner por Link" |
| Campos novos (destaque, mais vendido, preço "de", código interno, dias, quantidade mínima) | itens de exemplo |

Depois da aplicação, o backup NÃO é feito se a loja ainda tinha o cardápio padrão; nas seguintes ele é feito, com o nome da loja no arquivo.

## Parte 2: editar e apagar (`gerar-parte-2.js`)

As edições precisam dos ids reais, por isso o arquivo é gerado:

1. Clique **Exportar** de novo e salve o texto da caixa em `export.json`.
2. No terminal: `node gerar-parte-2.js export.json` (cria `teste-parte-2-gerado.json`).
3. Nas **Opções**, ligue **Permitir exclusões**.
4. Cole o `teste-parte-2-gerado.json`, **Ver mudanças**, **Aplicar** (vai pedir para digitar APAGAR).

O que a parte 2 faz e o que conferir:

| Ação | Resultado esperado |
|---|---|
| X-Salada: preço +R$ 2, destaque, código interno `TESTE-SALADA` | item editado |
| Coca-Cola Lata: descrição, preço "de", mais vendido, só sáb/dom, quantidade mínima 2 | item editado |
| Heineken: preço +R$ 5, +18 continua ligado | item editado |
| Guaraná 2L (combo): oculto | item some do cardápio do cliente |
| "Item Sem Imagem TESTE": apagado | item some |
| Grupo "Banner por Link": renomeado | nome novo |
| "Extras TESTE": renomeado para "(renomeado)", máximo 5, Bacon +R$ 1, Ovo oculto, **opção nova** "Cebola caramelizada" | tudo aplicado |
| "Adicionais TESTE": todos os preços +R$ 1, opção "Presunto" **apagada** | aplicado |
| "Grupo para Apagar TESTE": **apagado** inteiro | some do editor e dos itens |
| X-Bacon: **desligado** de "Ponto da Carne TESTE" | ligação some |

## Desfazer e histórico

Na aba **Histórico**, clique **Desfazer a última aplicação** após a parte 2. Deve voltar: edições de itens, grupo, grupos de complementos e opções; religar o X-Bacon; recriar a opção "Presunto" (com id novo). Um grupo de complementos **apagado** não volta (use o backup).

## Logo da loja como foto (opção)

Nas Opções, ligue **Usar o logo da loja nos itens sem foto**, desligue o banco de imagens e aplique um item novo qualquer sem foto: na revisão ele aparece como "logo da loja". O endereço do cardápio é lido sozinho da plataforma.

## Limpar a loja

Avançado → Zona de perigo → Limpar a loja (digite o nome e `LIMPAR TUDO`). Apaga itens, grupos e grupos de complementos. O apagar de **grupos do cardápio** ainda usa um endereço não confirmado: se a plataforma recusar, a extensão explica.
