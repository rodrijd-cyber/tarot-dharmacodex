# Tarot · Dharma Codex (`tarot.dharmacodex.org`)

Aplicación Web Progresiva (PWA) estática para el estudio simbólico y autoconocimiento con los 78 arcanos del Tarot.

## Estructura de carpetas

```text
├── index.html                  # Interfaz principal de la PWA
├── manifest.json               # Metadatos instalables en iOS y Android
├── service-worker.js           # Caché offline para uso sin conexión
├── css/
│   └── styles.css              # Estilos responsivos y ficha horizontal
├── js/
│   └── app.js                  # Lógica de exploración, tiradas criptográficas, quiz y progreso
├── data/
│   ├── cartas_tarot_v2.2.json  # Base de datos completa de las 78 cartas
│   └── tiradas.json            # 9 tiradas (Principiante, Iniciada, Del Aquelarre)
└── img/
    ├── icon.svg                # Icono vectorial de la app
    └── cartas/                 # Coloca aquí las imágenes nombradas por ID (ej. M00.webp, m-bastos-01.webp)
```

## Cómo agregar las imágenes de las cartas

1. Guarda cada imagen en formato `.webp` dentro de `img/cartas/` usando exactamente el campo `id` de `data/cartas_tarot_v2.2.json`:
   - Arcanos Mayores: `M00.webp` hasta `M21.webp`
   - Bastos: `m-bastos-01.webp` hasta `m-bastos-14.webp`
   - Copas: `m-copas-01.webp` hasta `m-copas-14.webp`
   - Espadas: `m-espadas-01.webp` hasta `m-espadas-14.webp`
   - Oros: `m-oros-01.webp` hasta `m-oros-14.webp`
2. Mientras tanto, la app muestra automáticamente un marcador visual con el símbolo elemental, ID y nombre de cada carta.

## Despliegue en Cloudflare Pages

1. Entra a **Cloudflare Dashboard → Workers & Pages → Create → Pages → Upload assets**.
2. Sube el contenido de esta carpeta (o conecta tu repositorio Git).
3. En **Custom domains**, vincula `tarot.dharmacodex.org`.
