# BodyCart

## Descripción General

BodyCart es una herramienta que protege a los usuarios de estafas, phishing y dropshipping de baja calidad al comprar online. Consiste en dos componentes principales:

### Extension de Chrome

Una extensión de navegador que detecta automáticamente cuando el usuario está en una página de producto (e-commerce genérico o Facebook Marketplace). Recopila datos relevantes de la página:

- **E-commerce:** HTML completo, scripts, formularios, iframes, metadata y screenshot
- **Facebook Marketplace:** Información del vendedor (antigüedad, ubicación, badges), detalles del listing (precio, descripción, condición), e imágenes

La extensión muestra feedback visual con código de colores (verde/amarillo/rojo) según el nivel de riesgo detectado.

### Backend (FastAPI)

API deployeada en Fly.io que ejecuta múltiples agentes de análisis en paralelo:

**Endpoints:**
- `POST /analyze` - Análisis de e-commerce genérico
- `POST /analyze/marketplace` - Análisis especializado de Facebook Marketplace

**Agentes para E-commerce:**
- Detección de phishing y seguridad (análisis multi-modal con LLM)
- Búsqueda de reviews online (Tavily + sentiment analysis)
- Comparación de precios con otros retailers

**Agentes para Marketplace:**
- Confianza del vendedor (antigüedad, ratings, historial)
- Análisis de precios (detección de precios sospechosamente bajos)
- Autenticidad de imágenes (detección de fotos de stock con Vision API)
- Red flags (pagos fuera de plataforma, contacto por WhatsApp, frases de estafa)
- Veredicto final con IA (Claude Sonnet 4.5)

El backend retorna un score de riesgo (0-100), nivel de riesgo (safe/suspicious/dangerous), y un veredicto explicativo en español chileno.

**URL de producción:** https://backend-summer-sunset-6933.fly.dev/
