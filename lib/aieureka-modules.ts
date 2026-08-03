import type { Module } from "@/types/lms";
import { productivityModule1 } from "@/app/aieureka/m1-fundamentals";
import { productivityModule2 } from "@/app/aieureka/m2-prompt-pack";
import { productivityModule3 } from "@/app/aieureka/m3-planning";
import { productivityModule4 } from "@/app/aieureka/m4-automation";

export const aieurekaModules: Module[] = [productivityModule1, productivityModule2, productivityModule3, productivityModule4];

export function getAieurekaModule(id: string) {
  return aieurekaModules.find((module) => module.id === id) ?? null;
}
