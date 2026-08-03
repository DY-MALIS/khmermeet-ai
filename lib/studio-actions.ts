"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function createStudioProject(formData: FormData) {
  const user = await requireUser();
  const title = formString(formData, "title") || "គម្រោងគ្មានចំណងជើង";
  const rawTranscript = formString(formData, "rawTranscript");
  const project = await prisma.workbenchProject.create({
    data: { ownerId: user.id, title, rawTranscript }
  });
  revalidatePath("/studio");
  redirect(`/studio/${project.id}`);
}

export async function deleteStudioProject(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const project = await prisma.workbenchProject.findFirst({ where: { id, ownerId: user.id } });
  if (!project) throw new Error("Project not found.");
  await prisma.workbenchProject.delete({ where: { id } });
  revalidatePath("/studio");
}
