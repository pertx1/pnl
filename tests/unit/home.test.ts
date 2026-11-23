import { describe, expect, it } from "vitest";
import { breakdown, countByProject, firstByProject, homeBounds, tasksDue } from "@/lib/dashboard/home";

describe("panel general", () => {
  it("límites de hoy y de la semana en Madrid", () => {
    const b = homeBounds(Date.parse("2026-11-23T23:30:00Z")); // 00:30 del martes 24 en Madrid
    expect(b.today).toBe("2026-11-24");
    expect(b.todayStartIso).toBe("2026-11-23T23:00:00.000Z");
    expect(b.tomorrowStartIso).toBe("2026-11-24T23:00:00.000Z");
    expect(b.weekLastDay).toBe("2026-11-30");
    expect(b.weekEndIso).toBe("2026-11-30T23:00:00.000Z");
  });

  it("cuenta y desglosa por proyecto en el orden de los proyectos", () => {
    const projects = [
      { id: "a", name: "Lumi" },
      { id: "b", name: "Pertx" },
      { id: "c", name: "Vacío" },
    ];
    const counts = countByProject([{ p: "b" }, { p: "a" }, { p: "b" }, { p: null }], (r) => r.p);
    expect(breakdown(projects, counts)).toEqual({
      total: 3,
      rows: [
        { id: "a", name: "Lumi", index: 0, count: 1 },
        { id: "b", name: "Pertx", index: 1, count: 2 },
      ],
    });
  });

  it("próxima publicación por proyecto y tareas vencidas", () => {
    const next = firstByProject([
      { project_id: "a", at: 1 },
      { project_id: "b", at: 2 },
      { project_id: "a", at: 3 },
    ]);
    expect(next.get("a")?.at).toBe(1);
    const t = tasksDue(
      [
        { project_id: "a", due_date: "2026-11-20" },
        { project_id: "a", due_date: "2026-11-24" },
        { project_id: "b", due_date: "2026-11-25" },
        { project_id: "b", due_date: null },
      ],
      "2026-11-24",
    );
    expect(t.due).toHaveLength(2);
    expect(t.overdue).toBe(1);
  });
});
