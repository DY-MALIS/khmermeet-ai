import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const demo = await prisma.user.upsert({
    where: { id: "local-demo-user" },
    update: {},
    create: {
      id: "local-demo-user",
      name: "Demo User",
      email: "demo@khmermeet.ai"
    }
  });

  const meeting = await prisma.meeting.upsert({
    where: { id: "demo-meeting" },
    update: {},
    create: {
      id: "demo-meeting",
      title: "ប្រជុំផែនការផលិតផល Q2",
      transcript: "សុខា នឹងរៀបចំផែនការផលិតផលនៅថ្ងៃសុក្រ។ ដារ៉ា ត្រូវត្រួតពិនិត្យ budget មុនថ្ងៃទី 2026-05-20។ ក្រុមសម្រេចចាប់ផ្តើម MVP នៅសប្តាហ៍ក្រោយ។",
      summary: "Meeting overview\nក្រុមបានពិភាក្សាអំពីផែនការ MVP និងការរៀបចំការងារ Q2.\n\nKey discussion points\n- រៀបចំ product plan\n- ពិនិត្យ budget\n- ចាប់ផ្តើម MVP សប្តាហ៍ក្រោយ",
      language: "km",
      duration: 1800,
      status: "summarized",
      createdById: demo.id
    }
  });

  const tasks = [
    {
      id: "demo-task-product-plan",
      data: {
        id: "demo-task-product-plan",
        meetingId: meeting.id,
        title: "រៀបចំ product plan",
        description: "Draft plan for Q2 MVP scope.",
        assigneeName: "សុខា",
        deadline: new Date("2026-05-08"),
        priority: "high",
        status: "in_progress",
        sourceText: "សុខា នឹងរៀបចំផែនការផលិតផលនៅថ្ងៃសុក្រ។"
      }
    },
    {
      id: "demo-task-budget",
      data: {
        id: "demo-task-budget",
        meetingId: meeting.id,
        title: "ពិនិត្យ budget",
        description: "Review Q2 launch budget.",
        assigneeName: "ដារ៉ា",
        deadline: new Date("2026-05-20"),
        priority: "medium",
        status: "not_started",
        sourceText: "ដារ៉ា ត្រូវត្រួតពិនិត្យ budget មុនថ្ងៃទី 2026-05-20។"
      }
    }
  ];

  for (const task of tasks) {
    await prisma.task.upsert({
      where: { id: task.id },
      update: {},
      create: task.data
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
