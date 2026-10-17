# ADR-0005 — Access token em memória, refresh em cookie httpOnly

**Data:** 2026-10-17 · **Status:** Aceito

## Contexto

Uma SPA precisa guardar a credencial de sessão em algum lugar. As opções têm perfis de
risco diferentes, e a escolha mais comum em tutorial (`localStorage`) é a pior delas.

| Onde              | Exposto a XSS      | Exposto a CSRF      | Sobrevive ao refresh da página |
| ----------------- | ------------------ | ------------------- | ------------------------------ |
| `localStorage`    | **Sim**            | Não                 | Sim                            |
| `sessionStorage`  | **Sim**            | Não                 | Apenas na aba                  |
| Cookie `httpOnly` | Não                | **Sim** (mitigável) | Sim                            |
| Memória do JS     | Não (não persiste) | Não                 | **Não**                        |

Um token em `localStorage` é legível por qualquer script injetado na página — incluindo
código de uma dependência comprometida. Não existe mitigação dentro da aplicação.

## Decisão

Dividir a sessão em dois tokens, cada um onde seu risco é menor:

| Token        | Duração | Onde                                             | Transporte                     |
| ------------ | ------- | ------------------------------------------------ | ------------------------------ |
| Access (JWT) | 15 min  | memória do JS                                    | header `Authorization: Bearer` |
| Refresh      | 7 dias  | cookie `httpOnly` + `Secure` + `SameSite=Strict` | automático pelo navegador      |

Mecanismos associados:

- **Rotação:** cada uso do refresh emite um novo e revoga o anterior (`replacedById`
  encadeia a cadeia).
- **Detecção de roubo:** reuso de um refresh já rotacionado → 401 `REFRESH_TOKEN_REUSED` e
  **revogação de toda a cadeia** daquele usuário.
- **Persistência segura:** apenas o **hash SHA-256** do refresh vai para o banco. Vazamento
  do dump não entrega sessões ativas.
- **Recarregar a página** perde o access (está em memória) e dispara `POST /auth/refresh`
  no boot do app — a sessão é restaurada de forma transparente.
- **Payload do JWT:** `sub`, `role`, `jti`. Nada de e-mail ou nome: JWT é assinado, não
  criptografado, e qualquer pessoa consegue decodificá-lo.
- **Segredos distintos** para access e refresh.

### CSRF

O cookie resolve XSS mas introduz CSRF. Mitigação em camadas:

1. `SameSite=Strict` — o navegador não envia o cookie em requisição originada de outro
   site. Esta é a defesa principal.
2. O cookie serve **apenas** a `POST /auth/refresh`, cuja única consequência é rotacionar a
   sessão do próprio usuário — não há operação de negócio acessível por ele.
3. Toda operação de negócio exige o access token no header `Authorization`, que um ataque
   CSRF não consegue definir.
4. CORS com allowlist explícita de origem.

## Consequências

**Positivas**

- XSS não alcança o refresh (`httpOnly`) nem o access (memória, não persiste)
- Janela de uso de um access roubado limitada a 15 minutos
- Rotação permite detectar roubo de refresh e cortar a sessão
- Vazamento do banco não expõe sessões

**Negativas**

- Mais complexo que `localStorage`: exige endpoint de refresh, fila de requisições durante
  o refresh em andamento e tratamento de 401 no cliente
- Um refresh extra a cada recarga de página
- Cookie `Secure` exige HTTPS — em desenvolvimento, `Secure` é condicionado ao ambiente

**Trade-off explícito:** o papel (`role`) vai dentro do access token, então rebaixar um
usuário leva até 15 min para surtir efeito nas permissões. A alternativa — consultar o
banco a cada requisição — custaria uma query por request para fechar uma janela de 15
minutos em um sistema interno. Mitigação: alterar papel ou inativar usuário revoga
imediatamente os refresh tokens do alvo, limitando a janela ao access já emitido.

Registrado como risco conhecido em §8.12.
