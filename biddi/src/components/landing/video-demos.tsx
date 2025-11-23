"use client";

import { ScrollReveal, StaggerReveal } from "@/components/ui/scroll-reveal";

const videos = [
  {
    id: "placeholder-1",
    title: "Primeros Pasos con BodyCart",
    description:
      "Aprende cómo instalar y configurar BodyCart en menos de un minuto.",
    thumbnail: null,
  },
  {
    id: "placeholder-2",
    title: "Detectando Estafas en Marketplace",
    description:
      "Mira cómo BodyCart identifica publicaciones sospechosas en Facebook Marketplace.",
    thumbnail: null,
  },
  {
    id: "placeholder-3",
    title: "Protección en Acción",
    description:
      "Observa cómo BodyCart te protege de intentos de phishing en tiempo real.",
    thumbnail: null,
  },
];

export function VideoDemos() {
  return (
    <section id="demos" className="py-24 px-4 bg-black">
      <div className="max-w-6xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-16">
          <ScrollReveal>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 font-heading">
              Míralo en Acción
            </h2>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <p className="text-xl text-white/60 max-w-2xl mx-auto">
              Observa cómo BodyCart te protege mientras compras en línea
            </p>
          </ScrollReveal>
        </div>

        {/* Video grid */}
        <StaggerReveal
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
          stagger={0.1}
        >
          {videos.map((video, index) => (
            <div
              key={index}
              className="group bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all duration-300 hover:bg-white/10"
            >
              {/* Video placeholder / embed area */}
              <div className="relative aspect-video bg-white/5 flex items-center justify-center">
                {/* Placeholder content */}
                <div className="text-center p-6">
                  <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-white/20 transition-colors">
                    <svg
                      className="w-8 h-8 text-white/60 ml-1"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                  <p className="text-white/40 text-sm">Video próximamente</p>
                </div>

                {/* Gradient overlay on hover */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              {/* Video info */}
              <div className="p-5">
                <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-white/80 transition-colors font-heading">
                  {video.title}
                </h3>
                <p className="text-white/60 text-sm leading-relaxed">
                  {video.description}
                </p>
              </div>
            </div>
          ))}
        </StaggerReveal>

        {/* Subscribe CTA */}
        <ScrollReveal delay={0.3}>
          <div className="mt-12 text-center">
            <p className="text-white/60 mb-4">
              Suscríbete a nuestro canal para más tutoriales y actualizaciones
            </p>
            <a
              href="https://youtube.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 border border-white/20 rounded-xl text-white hover:border-white/30 hover:bg-white/20 transition-colors"
            >
              <svg
                className="w-5 h-5 text-red-500"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
              Canal de YouTube
            </a>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
