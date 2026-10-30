import Image from "next/image";
import styles from "./page.module.css";
import Banner from "@/components/Banner/Banner";
import InTrend from "@/components/InTrend/InTrend";

export default function Home() {
  return (
    <>
    <Banner />
    <InTrend />
    </>
  );
}
