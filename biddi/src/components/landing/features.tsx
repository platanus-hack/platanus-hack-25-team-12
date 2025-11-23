"use client";

import { ScrollReveal, StaggerReveal } from "@/components/ui/scroll-reveal";
import PixelCard from "@/components/PixelCard";
import {
  ShieldCheck,
  MagnifyingGlass,
  FishSimple,
  Brain,
  SealCheck,
  BellRinging,
} from "@phosphor-icons/react";

const features = [
  {
    icon: <ShieldCheck size={32} weight="bold" />,
    title: "Detección de Estafas en Marketplace",
    description:
      "Análisis en tiempo real de publicaciones en Facebook Marketplace para identificar posibles estafas, vendedores falsos y patrones de precios sospechosos.",
  },
  {
    icon: <MagnifyingGlass size={32} weight="bold" />,
    title: "Alertas de Sitios Sospechosos",
    description:
      "Advertencias instantáneas cuando visitas sitios web potencialmente peligrosos, incluyendo tiendas falsas y sitios de comercio electrónico fraudulentos.",
  },
  {
    icon: <FishSimple size={32} weight="bold" />,
    title: "Protección contra Phishing",
    description:
      "Detección avanzada con IA de intentos de phishing en correos, mensajes y sitios web que intentan robar tu información personal.",
  },
  {
    icon: <Brain size={32} weight="bold" />,
    title: "Análisis con IA",
    description:
      "Modelos de machine learning entrenados con miles de patrones de estafa proporcionan protección inteligente y contextual.",
  },
  {
    icon: <SealCheck size={32} weight="bold" />,
    title: "Verificación de Pago Seguro",
    description:
      "Verifica la legitimidad de las páginas de pago y formularios antes de que ingreses información financiera sensible.",
  },
  {
    icon: <BellRinging size={32} weight="bold" />,
    title: "Notificaciones Instantáneas",
    description:
      "Recibe alertas inmediatas cuando se detectan amenazas potenciales, con explicaciones claras y acciones recomendadas.",
  },
];

export function Features() {
  return (
    <section id="features" className="py-24 px-4 bg-black">
      <div className="max-w-6xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-16">
          <ScrollReveal>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 font-heading">
              Protección Poderosa
            </h2>
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <p className="text-xl text-white/60 max-w-2xl mx-auto">
              BodyCart usa IA de última generación para mantenerte seguro de
              amenazas en línea mientras compras
            </p>
          </ScrollReveal>
        </div>

        {/* Features grid */}
        <StaggerReveal
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
          stagger={0.1}
        >
          {features.map((feature, index) => (
            <PixelCard
              key={index}
              variant="dark"
              className="bg-white/5 border-white/10 hover:border-white/20"
            >
              <div className="p-6">
                {/* Icon */}
                <div className="w-14 h-14 bg-white/10 rounded-xl flex items-center justify-center text-white mb-4">
                  {feature.icon}
                </div>

                {/* Content */}
                <h3 className="text-xl font-semibold text-white mb-2 font-heading">
                  {feature.title}
                </h3>
                <p className="text-white/60 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </PixelCard>
          ))}
        </StaggerReveal>
      </div>
    </section>
  );
}
