"use client";

import { ScrollReveal, StaggerReveal } from "@/components/ui/scroll-reveal";
import PixelCard from "@/components/PixelCard";
import {
  DownloadSimple,
  GearSix,
  ShieldCheckered,
} from "@phosphor-icons/react";

const steps = [
  {
    number: "01",
    title: "Descarga la Extensión",
    description:
      "Haz clic en el botón de descarga para obtener el archivo ZIP de BodyCart. Es completamente gratis sin costos ocultos.",
    icon: <DownloadSimple size={40} weight="bold" />,
  },
  {
    number: "02",
    title: "Instala en Chrome",
    description:
      "Extrae el ZIP, ve a chrome://extensions/, activa el Modo Desarrollador y carga la carpeta descomprimida.",
    icon: <GearSix size={40} weight="bold" />,
  },
  {
    number: "03",
    title: "Navega Seguro",
    description:
      "¡Eso es todo! BodyCart ahora funciona en segundo plano, analizando páginas y alertándote de amenazas potenciales automáticamente.",
    icon: <ShieldCheckered size={40} weight="bold" />,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 px-4 bg-neutral-950">
      <div className="max-w-6xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-16">
          <ScrollReveal>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 font-heading">
              Cómo Funciona
            </h2>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <p className="text-xl text-white/60 max-w-2xl mx-auto">
              Protégete en menos de un minuto con nuestra configuración simple
              de 3 pasos
            </p>
          </ScrollReveal>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Connection line */}

          <StaggerReveal
            className="grid lg:grid-cols-3 gap-8 lg:gap-12"
            stagger={0.15}
          >
            {steps.map((step, index) => (
              <div key={index} className="relative pt-4">
                {/* Step number badge - outside PixelCard to avoid overflow clip */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 px-4 py-1 bg-white rounded-full text-black font-bold text-sm z-20">
                  Paso {step.number}
                </div>

                {/* Card */}
                <PixelCard
                  variant="dark"
                  className="bg-white/5 border-white/10 hover:border-white/20"
                >
                  <div className="p-8 pt-6 text-center">
                    {/* Icon */}
                    <div className="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center text-white mx-auto mb-6">
                      {step.icon}
                    </div>

                    {/* Content */}
                    <h3 className="text-2xl font-semibold text-white mb-3 font-heading">
                      {step.title}
                    </h3>
                    <p className="text-white/60 leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </PixelCard>

                {/* Arrow connector for mobile */}
                {index < steps.length - 1 && (
                  <div className="lg:hidden flex justify-center my-4">
                    <svg
                      className="w-6 h-6 text-white/30"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 14l-7 7m0 0l-7-7m7 7V3"
                      />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </StaggerReveal>
        </div>
      </div>
    </section>
  );
}
