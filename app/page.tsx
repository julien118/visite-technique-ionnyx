import { redirect } from "next/navigation";

// Redirige la racine vers la liste des chantiers
export default function Home() {
  redirect("/chantiers");
}
