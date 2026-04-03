import { useParams } from "wouter";
import { getServiceBySlug } from "./serviceData";
import ServicePage from "./ServicePage";
import NotFound from "@/pages/NotFound";

export default function ServiceRoute() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";
  const service = getServiceBySlug(slug);

  if (!service) {
    return <NotFound />;
  }

  return <ServicePage service={service} />;
}
