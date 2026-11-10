# RESEARCH — PayPal AI Hackathon (concepto elegido)

**Fecha:** 9 nov 2026, ~22:07 Europe/Warsaw (UTC+1)  
**Cierre:** 12 nov 2026 12:00 PST = 12 nov 20:00 UTC = **12 nov 21:00 Europe/Warsaw**  
**Estado:** solo research y diseño. No hay código de producto, no se crearon cuentas, no hay registros.  
**Idea elegida:** agentic commerce para comercios físicos con accountability de pago (AUTHORIZE → evidencia de entrega simulada → CAPTURE; si falla → investigar/proponer → VOID, o refund si ya se capturó). Sin biometría. El LLM no decide montos.  
**Glance (pago con cara):** descartada salvo cambio explícito de Víctor.  
**Nombre provisional del producto:** `Proofed` (cambiable en un solo archivo de config; ver §5).

---

## 1. Research técnico PayPal (docs oficiales)

### 1.1 Flujo AUTHORIZE / capture / void / reauthorize

Fuentes:

- Auth-capture (Checkout): https://developer.paypal.com/platforms/checkout/standard/customize/auth-capture (14 oct 2026)
- Auth-capture JS SDK: https://developer.paypal.com/v5/checkout/auth-capture
- Honor period: https://developer.paypal.com/payment-methods/auth-honor
- Orders overview: https://developer.paypal.com/whats-an-order (17 ago 2026)
- Payments v2: https://developer.paypal.com/docs/api/payments/v2/#authorizations_void
- Idempotencia: https://developer.paypal.com/reference/guidelines/idempotency y https://developer.paypal.com/api/make-api-requests

Pasos reales:

1. Crear order con `"intent": "AUTHORIZE"` vía `POST https://api-m.sandbox.paypal.com/v2/checkout/orders`.
2. El buyer aprueba en PayPal (JS SDK popup o `checkoutnow?token=…`). Hasta entonces el status no es `APPROVED`. Docs: “Orders can't be authorized until the status of the order is set to APPROVED.”
3. `POST /v2/checkout/orders/{order_id}/authorize` → hold sobre los fondos. Devuelve `purchase_units.payments.authorizations[].id`.
4. Cuando hay evidencia de entrega: `POST /v2/payments/authorizations/{authorization_id}/capture` (Payments v2, **no** `POST …/orders/{id}/capture`).
5. Si la entrega falla y aún no se capturó: `POST /v2/payments/authorizations/{authorization_id}/void`.
6. Si ya se capturó: `POST /v2/payments/captures/{capture_id}/refund`.
7. Reauthorize (opcional, no hace falta en el demo de minutos): `POST /v2/payments/authorizations/{authorization_id}/reauthorize`. Genera un **nuevo** authorization ID; el capture posterior debe usar ese ID.

Plazos:

- **Order:** tras crearla hay ~3 h para autorizarla/modificarla (docs Orders; extensible a 72 h con TAM). Para el demo esto solo importa si el buyer no aprueba enseguida.
- **Authorization:** válida **29 días**.
- **Honor period:** los **primeros 3 días** de la autorización; PayPal recomienda capturar ahí. Después el éxito del capture depende de riesgo y fondos. Si se reautoriza el día 27, el honor period nuevo es de solo 2 días.
- **Capture amount:** menos, igual, o hasta 115% / +$75 USD (el menor de los dos) sobre lo autorizado. En este proyecto capturaremos **exactamente** el monto autorizado (fijo por catálogo). Capturas parciales de PayPal wallet pueden exigir habilitación en la cuenta; no las usaremos.
- Docs de void mencionan caducidad de “30 day validity period”; las páginas de honor period hablan de 29 días. Discrepancia menor de docs; en el demo no aplica.

Nota sobre “Partner requirements” en la página platforms/auth-capture: esa guía está en el path de partners/marketplaces (`payment_instruction.platform_fees`, `disbursement_mode`). **No usaremos** `platform_fees` ni onboarding de sellers. El mismo modelo AUTHORIZE + authorize + capture/void está documentado para merchants directos en Orders v2 / Payments v2 y en la guía del JS SDK (`intent=authorize`). En sandbox de una app Merchant debería bastar Accept payments. No verificado con credenciales (no las tenemos).

### 1.2 JS SDK buttons con intent=authorize

Fuente: https://developer.paypal.com/platforms/checkout/standard/customize/auth-capture y https://developer.paypal.com/v5/checkout/auth-capture

```html
<script src="https://www.paypal.com/sdk/js?client-id=CLIENT_ID&intent=authorize"></script>
```

Por defecto el SDK autoriza **y captura**. Hay que pasar `&intent=authorize`. En `createOrder` el servidor crea la order con `intent: AUTHORIZE`. En `onApprove` el servidor llama a `/authorize`, **no** a `/capture`. El capture ocurre después, cuando el dispositivo/comercio confirma entrega.

El buyer sandbox (cuenta personal US) inicia sesión y aprueba una vez por compra. Eso es intencional y encaja con el brief (“PayPal AUTHORIZE con aprobación del buyer”).

### 1.3 Webhooks y verificación de firma

Fuente de nombres: https://developer.paypal.com/api/rest/webhooks/event-names (10 sep 2026)  
Integración: https://developer.paypal.com/api/rest/webhooks/rest  
Simulador: https://developer.paypal.com/api/rest/webhooks/simulator

Eventos relevantes (todos existen en docs):

| Evento | Cuándo |
|---|---|
| `CHECKOUT.ORDER.APPROVED` | El buyer aprobó la order |
| `PAYMENT.AUTHORIZATION.CREATED` | Se creó la autorización |
| `PAYMENT.AUTHORIZATION.VOIDED` | Void manual o caducidad |
| `PAYMENT.CAPTURE.COMPLETED` | Capture OK |
| `PAYMENT.CAPTURE.DECLINED` | Capture rechazado |
| `PAYMENT.CAPTURE.PENDING` | Capture pendiente |
| `PAYMENT.CAPTURE.REFUNDED` | Merchant reembolsó |
| `PAYMENT.CAPTURE.REVERSED` | PayPal revirtió el capture |
| `CHECKOUT.PAYMENT-APPROVAL.REVERSED` | Problema después de aprobar y antes de capturar |

El listener debe ser **HTTPS puerto 443** y responder 2xx. PayPal reintenta hasta 25 veces en 3 días si no hay 2xx.

Verificación de firma (obligatoria antes de confiar en el evento):

- Headers: `PAYPAL-TRANSMISSION-ID`, `PAYPAL-TRANSMISSION-TIME`, `PAYPAL-TRANSMISSION-SIG`, `PAYPAL-CERT-URL`, `PAYPAL-AUTH-ALGO`.
- Opción A (recomendada por PayPal si se puede): verificar en local con el certificado y `transmissionId|timeStamp|webhookId|crc32(rawBody)`.
- Opción B: `POST /v1/notifications/verify-webhook-signature` con esos headers + `webhook_id` + **body crudo** (no re-serializar JSON).
- Responder 200 pronto y procesar de forma idempotente (deduplicar por `event.id`).
- El simulador de dashboard envía **mocks**: no se asocian a la app, no aparecen en el event viewer, **no se pueden verificar** con `verify-webhook-signature`. Sirven para probar que el endpoint recibe POST, no para reconciliar un pago real.

### 1.4 Idempotencia: `PayPal-Request-Id`

Fuentes: https://developer.paypal.com/reference/guidelines/idempotency y https://developer.paypal.com/api/make-api-requests

- Header recomendado en todo POST/PUT que cree o muta.
- UUID, ≤ 38 caracteres.
- PayPal guarda el ID hasta ~45 días y, si se reenvía el mismo, devuelve el resultado original en lugar de duplicar.
- Debe ser único **por tipo de operación** (authorize ≠ capture ≠ void ≠ refund).
- No todas las APIs lo documentan igual; capture/reauthorize de authorizations sí lo muestran en ejemplos.
- El Agent Toolkit tiene un issue (#98) de que no setea bien este header: **otra razón para hablar REST directo** en authorize/capture/void.

Además, el backend propio guardará `request_id` por transición de estado (doble capa: la nuestra + la de PayPal).

### 1.5 Agent Toolkit vs REST

Fuente tools: https://developer.paypal.com/ai-tools/agent-tools (29 oct 2026)

Payments expuestos: `create_order`, `get_order`, `pay_order` (describe “Capture payment for an authorized order” — en la práctica captura por `order_id`), `create_refund`, `get_refund`.

**No hay** tools documentadas de `authorize`, `void` ni `reauthorize`. El flujo elegido **no cabe** en el Toolkit sin REST. Decisión: cliente HTTP propio contra Orders v2 + Payments v2 (sandbox). El Toolkit/MCP hosted no es dependencia. El MCP hosted además ha fallado de forma intermitente (`Unsupported cache mode: default`; Devpost #45463, GitHub paypal/agent-toolkit#119).

El agente de producto (LLM) no llamará a PayPal: llamará tools internas (`search_catalog`, `propose_checkout`, `propose_recovery`). El backend valida y ejecuta PayPal.

### 1.6 Probar sin URL pública

| Método | ¿Webhooks reales? | Notas |
|---|---|---|
| Localhost solo | No | PayPal no puede pegar a localhost. Fallback: polling `GET /v2/checkout/orders/{id}` y `GET /v2/payments/authorizations/{id}` + estado local. Suficiente para desarrollar. |
| Simulador de webhooks | Mocks | No firman, no ligan a un pago real. |
| ngrok / Cloudflare Tunnel (`cloudflared`) | Sí | HTTPS público → localhost. **No están instalados** en esta caja ahora. Se pueden instalar después si hace falta. |
| Render o Vercel (URL HTTPS) | Sí | Registrar la URL `/api/paypal/webhooks` en la app sandbox (Dashboard → app → webhooks) y guardar el `webhook_id` para verificar firmas. |

Diseño: el sistema de estados avanza tanto por respuesta síncrona de la API (authorize/capture/void) como por webhook (reconciliación). Así el demo local funciona sin túnel; el demo público hospedado recibe webhooks de verdad.

---

## 2. Reglas Devpost y claims del otro documento

### 2.1 Reglas relevantes (Official Rules + overview)

Fuente: https://paypalaihackathon.devpost.com/rules y https://paypalaihackathon.devpost.com/

- Proyecto **nuevo** o existente con progreso **significativo** durante el Submission Period (1 oct 9:15 PDT – 12 nov 12:00 PST). Hay que explicar qué se actualizó. Un proyecto nuevo es más limpio.
- Demo **funcional**: URL hospedada **o** instrucciones claras para correrlo. Mockup no vale. Los jueces pueden juzgar solo con video/texto.
- Repo **público** (GitHub/GitLab/Bitbucket) + LICENSE open source visible en About.
- Video **< 3 min**, YouTube público, en inglés (o con traducción), proyecto corriendo, sin marcas/música ajenas sin permiso.
- Declarar tools de IA y cómo se usaron.
- Terceros: hay que estar autorizado a usar sus SDK/API y respetar licencias.
- Hardware propietario no ampliamente disponible: el sponsor puede exigir acceso físico. **Nuestro “dispositivo” es una página web simulada** → no aplica.
- Individual OK; México elegible (no está en la lista de exclusión).
- Un proyecto: como máximo 1 Grand + 1 Sponsor, **o** 1 Honorable + 1 Sponsor.

### 2.2 Premio AG Grid

- Official Rules §8: “All Eligible Submissions that use **any AG Grid tools**.” 1º $5,000 / 2º $2,000 / 3º $1,000 (homepage/blog: 3er lugar × 3).
- Página del sponsor https://paypalaihackathon.devpost.com/details/aggrid : el premio cubre “what your dashboard looks like and how you build it”. Piden polish (custom widgets, theming, layout), “not just AG Grid or AG Charts on their own”. Animan a usar **Studio Agent Framework**.
- **No exigen AG Studio de forma normativa** (las Rules dicen “any AG Grid tools”). El criterio de juicio del sponsor **sí empuja** a Studio.
- AG Grid Community / AG Charts Community: MIT, usables sin licencia de pago.
- AG Studio: producto comercial (https://www.ag-grid.com/studio/license-pricing/); hay trial (~45 días, según páginas de licencia). El blog de AG Grid del hackathon (1 oct 2026, https://www.ag-grid.com/blog/hackathon-paypal-and-ag-studio/) promociona Studio y un boilerplate; nombra el premio “Best Use of AG Studio”, pero el nombre oficial en Devpost es “Best Use of AG Grid”.
- **Recomendación para 1.5 días:** no bloquear el build en Studio. Si sobra tiempo, meter AG Grid Community en el panel del merchant (cualifica por Rules). Studio queda como extra opcional.

### 2.3 Premio APIMatic

- Official Rules §8: “All Eligible Submissions that use **any APIMatic tools**.” $1,000 + 6 meses Business (homepage: ×3 ganadores).
- Página https://paypalaihackathon.devpost.com/details/apimatic : usar el **Context Plugin for PayPal** (da contexto de la API de PayPal a agentes de código tipo Claude Code). “Since PayPal is already enabled, you won't need any extra credentials or sign-in details through APIMatic.”
- Quien use el plugin: 1 mes de APIMatic Basic gratis. Equipos ganadores que lo usaron: 6 meses Business.
- El plugin ayuda a **escribir** la integración; no es una dependencia runtime del producto.
- **Recomendación:** no pedirle a Víctor setup de APIMatic. Si más adelante el agente de código lo usa, se declara en el form de Devpost. No es path crítico.

### 2.4 Afirmaciones del otro documento

| Afirmación | ¿Confirmada? | Evidencia |
|---|---|---|
| **Agent Ready** | **Sí** | Overview oficial, actualizado 13 oct 2026: https://developer.paypal.com/agent-ready/overview — acepta pagos de asistentes de IA (ChatGPT, Google AI Mode, Gemini) sin una integración distinta por plataforma. |
| **ACP / UCP** | **Sí** | Misma página: ACP (Agentic Commerce Protocol) para ChatGPT/OpenAI vía tokens delegados en **Braintree**; UCP (Universal Commerce Protocol) + Braintree (Google Pay) para Google AI Mode/Gemini; UCP + PayPal (Google Pay handler → Orders v2) para merchants PayPal. **No construiremos sobre ACP/UCP/Braintree** en 1.5 días: el producto usa Orders v2 AUTHORIZE directo, que es el mismo primitive de pago y encaja con el tema “agentic commerce + accountability”. |
| **WebMCP de septiembre** | **Sí** | Blog oficial **16 sep 2026**: https://developer.paypal.com/community/blog/WebMCP_PayPal_Agent_Ready/ — “WebMCP is here…”. Estándar abierto para que un agente descubra productos, arme carrito e inicie checkout en el storefront; el buyer sigue aprobando el pago en PayPal. Hoy limitado a merchants **Store Sync**, vía JS SDK. Benchmark interno (ellos lo llaman small/sandbox): ~2× más rápido en mediana, ~4.6× menos cómputo, **3 llamadas estructuradas vs 30+** clics. No es un producto que debamos integrar: es contexto narrativo (el buyer aprueba; el agente no toma las credenciales). |
| **Agentic Commerce Pulse Report ~95%** | **Sí, con el wording exacto** | Artículo PayPal 27 abr 2026: https://www.paypal.com/us/brc/article/agentic-commerce-pulse-report-findings — estudio de 498 merchants US (encuesta 23 feb–3 mar 2026). La cifra: “almost **95%** reporting at least **partial visibility**” de visitas o transacciones de agentes de IA (casi la mitad las trackean de forma activa). **No** dice que el 95% esté listo o haya adoptado agentic checkout. PDF: https://www.paypalobjects.com/marketing/web26/us/agentic-commerce-pulse-report/paypal-agentic-commerce-report_le-report.pdf |
| **Artículo 16 oct sobre dificultades de merchants** | **Sí** | “What Merchants Need to Know About Agentic Commerce and Why It’s Harder Than It Looks”, Laura Gower, **16 oct 2026**: https://www.paypal.com/us/brc/article/agentic-commerce-merchant-readiness-checklist — la fricción es de **ejecución** (múltiples protocolos, integraciones, identidad/fraude/responsabilidad), no de awareness. Encaja con nuestro pitch: un solo flujo determinista de autorización + evidencia + capture/void. |
| **Artículos de octubre sobre gobernanza de tools** | **Sí (dos blogs oficiales)** | 8 oct 2026: “What We Learned Building PayPal's MCP Gateway” https://developer.paypal.com/community/blog/PayPal_MCP_Gateway/ (identidad, autorización por tool, review, audit; ~200 servers / 3,318 tools). 9 oct 2026: “How PayPal is governing agent skills at enterprise scale” https://developer.paypal.com/community/blog/agent_skills_at_enterprise_scale/ (validación + human review antes de publicar skills). Útiles como **contexto de diseño** (el LLM no mueve dinero solo); no son APIs a integrar. |

---

## 3. Stack propuesto (1 bot, ~1.5 días)

Lo más simple que cubre: chat del agente, botones PayPal, panel merchant, simulador de dispositivo, máquina de estados, webhooks, SQLite.

| Pieza | Elección | Por qué |
|---|---|---|
| App | **Next.js + TypeScript** (App Router) | Un solo proceso sirve UI + API. Los ejemplos oficiales de PayPal usan Next. Deploy fácil. |
| Estado | **SQLite** (`better-sqlite3` o driver equivalente) en un archivo bajo `data/` | Cero servicio extra en local. En Vercel el FS es efímero: para demo público preferir **Render** (un web service Node, el archivo sobrevive mientras vive la instancia) o aceptar reset del demo. No hace falta Postgres. |
| Pagos | **REST Orders v2 + Payments v2** + **JS SDK `intent=authorize`** | El Toolkit no trae authorize/void. |
| Agente | **Vercel AI SDK** (`ai` + `@ai-sdk/openai`) con tool-calling | Encaja con Next. Tools del LLM solo proponen; el backend valida. |
| LLM | **OpenAI `gpt-4o-mini`** (configurable a `gpt-4o`) | Los ejemplos de PayPal usan OpenAI/function calling; barato, fiable con tools, una sola env `OPENAI_API_KEY`. Alternativa si Víctor prefiere: Anthropic (`ANTHROPIC_API_KEY`) — mismo patrón, más setup. No usaremos un LLM local. |
| Dispositivo | Página `/device` | Simula el kiosco/handheld: lista pedidos AUTHORIZED, botones “Confirmar entrega” (nota/foto opcional en base64) o “Marcar fallo”. Cero hardware. |
| Hosting demo | **Render** (gratis/starter) como primera opción; **Vercel** como alternativa | Render: Node largo + SQLite más predecible + premio sponsor de créditos (opcional). Vercel: el path más corto para Next, pero SQLite no persiste bien. El overview de Devpost acepta también “instrucciones para correrlo” si el host falla. |
| UI merchant | Tabla HTML propia al inicio; **AG Grid Community (MIT)** solo si sobra tiempo | No bloquear por Studio. |

Controles deterministas (fuera del LLM):

- Catálogo fijo (venue demo) con precios.
- Allowlist de merchant/SKU.
- El monto enviado a PayPal se calcula en backend.
- Máquina de estados: `CREATED → APPROVED → AUTHORIZED → DELIVERY_CONFIRMED → CAPTURED` o `AUTHORIZED → DELIVERY_FAILED → VOIDED`; `CAPTURED → REFUNDED`.
- `PayPal-Request-Id` por mutación + dedupe de webhooks por `event.id`.

---

## 4. Qué hay en esta caja (9 nov 2026, ~22:07 Warsaw)

| Tool | Versión / estado |
|---|---|
| Node | v24.22.1 |
| npm | 11.21.1 — `npm ping` a registry.npmjs.org: PONG 132 ms |
| pnpm | 10.34.6 |
| Python | 3.13.5 |
| git | 2.47.3 |
| `gh` | instalado, **no autenticado** (`gh auth login` pendiente si se quiere push desde aquí) |
| ngrok / cloudflared / sqlite3 CLI | **no instalados** (sqlite vía npm sirve) |

Reutilizable **solo listado** (no se copiará nada hasta que empiece el build, y no se usará Point & Pay / Millie):

- Effisend (clones de review): `/workspace/repos-review/r/Effi-Send`, `EffiSend-Core`, `EffiSend-Hedera`, `EffiSend-Kaia`, `EffiSend-Line`, `EffiSend-MXNB`, `EffiSend-Meta`, `EffiSend-MiniApp`, `EffiSend-OPOS`, `EffiSend-Sei`, `EffiSend-Solana`, `EffiSend-SolanaMobile`, `EffiSend-Starknet`, `Effisend-Virtuals`
- Informe piloto: `/workspace/Effisend-Pilot-Report-v2.pdf`
- Waypoint / Alexa MCP: `/workspace/amazon-alexa-mcp`, `/workspace/repos-review/r/Waypoint`
- Aether: `/workspace/repos-review/r/Aether`, `/workspace/sui-campaign/r3/aether`, `/workspace/sui-campaign/r3/aether-repo`
- LangChain (no LangGraph de producto): `/workspace/repos-review/r/langchain-lilypad`, `/workspace/repos-review/r/DeSmond-Batches`
- No apareció un directorio “Open Dome” / “langgraph” de app

Este proyecto se construirá **de cero** en `/workspace/paypal-hack/` para que el zip sea autocontenido.

---

## 5. Diseño de carpeta (solo diseño; aún no creado salvo este archivo)

Ruta única descargable: `/workspace/paypal-hack/`

```
/workspace/paypal-hack/
  RESEARCH.md                 ← este archivo
  project.config.json         ← ÚNICO sitio del nombre público
  .env.example
  .env                        ← gitignored; lo rellena el bot con lo que Víctor envíe por formulario
  package.json
  tsconfig.json
  README.md                   ← inglés (requisito Devpost)
  LICENSE                     ← MIT
  .gitignore
  scripts/pack.sh             ← zip limpio para descargar si se acaban créditos
  data/app.sqlite             ← gitignored
  app/                        ← Next.js App Router
    page.tsx                  ← chat del shopper + botones PayPal
    merchant/page.tsx         ← panel: estados, evidencia, recuperaciones
    device/page.tsx           ← simulador de dispositivo
    api/agent/route.ts
    api/paypal/create-order/route.ts
    api/paypal/authorize/route.ts
    api/paypal/capture/route.ts
    api/paypal/void/route.ts
    api/paypal/refund/route.ts
    api/paypal/webhooks/route.ts
    api/device/confirm/route.ts
    api/device/fail/route.ts
  lib/
    config.ts                 ← lee project.config.json
    paypal.ts                 ← REST + PayPal-Request-Id
    policy.ts                 ← montos, allowlist, transiciones
    db.ts
    webhooks.ts               ← verificación de firma + dedupe
```

`project.config.json` (ejemplo de diseño):

```json
{
  "name": "Proofed",
  "slug": "proofed",
  "tagline": "Authorize now. Capture only after proof of handover.",
  "venueName": "Dome City Gift Shop"
}
```

`scripts/pack.sh` (diseño): empaqueta `/workspace/paypal-hack` en `/workspace/paypal-hack-<slug>-<fecha>.zip` excluyendo `node_modules`, `.next`, `.env`, `data/*.sqlite`, `.git`. Así Víctor puede descargar la carpeta entera si se cortan créditos.

No se escribe código de producto hasta que lleguen las credenciales pedidas abajo.

---

## 6. Lista de lo que Víctor debe entregar

**Las claves van por formulario seguro, nunca en este chat.**

### Imprescindible (sin esto no puedo construir ni probar pagos)

1. **Client ID y Client Secret de una app sandbox de PayPal**  
   **Por qué:** autenticación OAuth (`POST /v1/oauth2/token`) y el `client-id` del JS SDK.  
   **Cómo:**  
   1. Entra a https://developer.paypal.com/ con tu cuenta PayPal (si el alta se traba por país/teléfono, pide ayuda en https://discord.gg/sJ2G6DyvSK).  
   2. Dashboard → palanca **Sandbox**.  
   3. Apps & Credentials → Create App (tipo **Merchant**), o usa la Default Application.  
   4. Copia Client ID y Secret (Sandbox).  
   5. En la app, Features → Accept payments: activado. **No hace falta Vault** ni Advanced Cards para este flujo (PayPal Wallet + AUTHORIZE).  
   6. Envía ambos valores por el formulario seguro.

2. **Cuenta sandbox Business (seller) — preferible país United States**  
   **Por qué:** es el merchant que autoriza/captura; las default a veces heredan el país del developer. Una Business US evita sorpresas de features.  
   **Cómo:** Dashboard → Testing Tools → Sandbox Accounts → Create account → Business → Country/Region **United States** → Create. Anota email `sb-…@business.example.com` y password (View/Edit account). Opcional: ponle saldo de prueba. Envía email + password (son cuentas ficticias de sandbox, pero trátalas igual de privadas).

3. **Cuenta sandbox Personal (buyer) — United States**  
   **Por qué:** en el video/demo hay que iniciar sesión en `sandbox.paypal.com` y aprobar el AUTHORIZE.  
   **Cómo:** igual que arriba, tipo **Personal**, país **United States**. Anota email `sb-…@personal.example.com` y password. Envíalos por el formulario. Conviene un saldo sandbox holgado (p. ej. $1,000) para varias compras de prueba.

4. **API key del LLM (OpenAI)**  
   **Por qué:** el agente conversacional (tool-calling) no puede ir sin modelo. Default: `gpt-4o-mini`.  
   **Cómo:** https://platform.openai.com/api-keys → Create new secret key. Si prefieres Anthropic, dilo y manda `ANTHROPIC_API_KEY` en su lugar. No la pegues en el chat.

### Imprescindible de decisión (no es secreto, pero lo necesito por escrito)

5. **Nombre del proyecto** — provisional `Proofed`. Si quieres otro, dímelo ahora: se cambia en `project.config.json`.  
6. **Idioma del producto y del README/video:** inglés (requisito Devpost; se puede poner UI bilingüe después, no al inicio).  
7. **Licencia MIT** — asumo que sí, salvo que digas otra open source visible en el repo.  
8. **Join en Devpost** — lo haces tú en https://paypalaihackathon.devpost.com/ (botón Join Hackathon). Yo no me registro.  
9. **Repo público de GitHub** — nombre/org (propuesta: `altaga/proofed` o el slug que elijas). Yo no tengo `gh` autenticado en esta máquina. Opciones: (a) creas el repo vacío y más tarde haces push del zip / me das acceso; (b) cuando el código esté listo, lo subes tú. Un Personal Access Token **solo si tú lo ofreces por formulario** y quieres que yo haga el push: es opcional y sensible.

### Opcional (mejora el demo, no bloquea el día 1)

10. **Cuenta Render y/o Vercel** para URL pública (jueces + webhooks reales). Render es preferible por SQLite. Puedes crear el proyecto después y yo te dejo instrucciones de deploy; un token de deploy por formulario es opcional.  
11. **Webhook URL** — solo cuando exista el host. Entonces, en la app sandbox: Add Webhook → tu `https://<host>/api/paypal/webhooks` → suscribir `CHECKOUT.ORDER.APPROVED`, `PAYMENT.AUTHORIZATION.CREATED`, `PAYMENT.AUTHORIZATION.VOIDED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DECLINED`, `PAYMENT.CAPTURE.REFUNDED`, `CHECKOUT.PAYMENT-APPROVAL.REVERSED`. Copia el **Webhook ID** al formulario (hace falta para verificar firmas). Mientras tanto trabajo con polling + respuestas síncronas.  
12. **AG Grid / APIMatic / canal YouTube** — no hacen falta para empezar. YouTube y Submit en Devpost son del último día (tú subes el video y pulsas Submit).

### Qué no me hace falta

- Vault, PYUSD, Advanced Cards, Payouts, biometría, hardware, cuenta live de PayPal, APIMatic login, licencia de AG Studio.

---

## 7. Flujo exacto que demostraremos

1. Shopper habla con el agente: “quiero el llavero de $12”. El LLM propone el SKU; el backend fija $12.00 USD y crea la order `AUTHORIZE`.
2. El shopper aprueba con el botón PayPal (cuenta personal sandbox).
3. El servidor hace `/authorize`. El panel merchant muestra AUTHORIZED (fondos en hold, no cobrados).
4. En `/device` (simulador) el comercio pulsa “Confirmar entrega” y adjunta una nota/foto. El backend hace capture. Estado CAPTURED + evidencia visible.
5. Camino alterno: el dispositivo marca fallo → el agente propone otra opción o cancelar → el backend hace VOID (o refund si ya había capture). El panel muestra la recuperación.

Copy: no decir “non-custodial”; no inflar métricas del piloto de Tokyo. El piloto (24 pagos / $678.43, gas como fricción) puede mencionarse solo como motivación de comercios físicos, no como usuarios de este demo.
