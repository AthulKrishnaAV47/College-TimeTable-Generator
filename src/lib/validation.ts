import { z } from "zod";
import { WEEKDAYS } from "./types";
const code = z.string().trim().min(1).max(100);
const text = z.string().max(500);
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sectionMode = z.enum(["alternative", "mandatory-combo"]);
const cell = z.object({ day: z.enum(WEEKDAYS), startTime: time, endTime: time });
const section = z.object({ batch: text, slotCode: text, department: text, faculty: z.array(text).max(30), startDate: date, endDate: date, weeklyCells: z.array(cell).max(200), weeklyHours: z.number().min(0).max(200), selfPaced: z.boolean() });
export const courseSchema = z.object({ courseCode: code, courseName: text, credits: z.number().min(0).max(100), category: text, sections: z.array(section).max(100), sectionMode, aliases: z.array(code).max(100).optional() });
const year = z.enum(["I", "II & III"]);
export const profileSchema = z.object({ year, termLabel: z.string().max(160), completedCourseCodes: z.array(code).max(1000) });
const warnings = z.array(z.string().max(2000)).max(2000);
export const slotSheetSchema = z.object({ text: z.string().max(1_000_000), courses: z.array(courseSchema).min(1).max(1000), warnings });
export const eligibilitySchema = z.object({ text: z.string().max(1_000_000), rows: z.array(z.object({ courseCode: code, type: z.enum(["SBC", "FC"]), year })).min(1).max(5000), warnings });
const prefs = z.object({ sectionMode, preferredFaculty: text.nullable(), lockedPlacementId: code.nullable().optional(), lockedPlacementSignature: z.string().max(200_000).nullable().optional() });
const placement = z.object({ id: code, courseCode: code, sections: z.array(section).max(100), busy: z.array(cell).max(1000) });
const metrics = z.object({ weeklyContactHours: z.number(), daysWithClasses: z.number(), freeDays: z.number(), totalGaps: z.number(), earliestStart: time.nullable(), latestEnd: time.nullable(), preferredFacultyHits: z.number() });
export const draftSchema = z.object({ id: code, label: z.string().min(1).max(160), createdAt: z.string().datetime(), profile: profileSchema, termDatasetId: z.string().uuid().nullable().optional(), metrics,
  courseChoices: z.array(z.object({ courseCode: code, courseName: text, credits: z.number(), type: z.enum(["SBC", "FC"]), placementId: code, sectionMode })).max(100), placements: z.record(code, placement) });
// Transient solver output is deliberately not persisted; it is recomputed from
// validated inputs after loading instead of trusting stale browser results.
export const stateSchema = z.object({
  pinnedCourseCodes: z.array(code).max(100).default([]),
  autoInitialCourseCodes: z.array(code).max(1000).default([]),
  datasetSource: z.object({ label: z.string().max(160), updatedAt: z.string().datetime({ offset: true }).nullable(), loadedAt: z.string().datetime() }).nullable().default(null),
  step: z.number().int().min(0).max(5), slotSheet: slotSheetSchema.nullable(), eligibility: eligibilitySchema.nullable(), profile: profileSchema,
  termDatasetId: z.string().uuid().nullable().optional(), mode: z.enum(["manual", "auto"]), manualPicks: z.record(code, z.boolean()),
  autoSettings: z.object({ targetCount: z.number().int().min(1).max(100), targetCredits: z.number().min(1).max(500), useCredits: z.boolean(), minSBC: z.number().int().min(0).max(100), minFC: z.number().int().min(0).max(100) }),
  autoChosen: z.array(code).max(100).nullable(), coursePrefs: z.record(code, prefs),
  constraints: z.object({ excludedDays: z.array(z.enum(WEEKDAYS)).max(7), excludedRanges: z.array(z.object({ start: time, end: time })).max(30) }),
  rankBy: z.enum(["fewest-gaps", "most-free-days", "earliest-finish", "preferred-faculty"]),
});
export const workspaceSchema = z.object({ state: stateSchema, drafts: z.array(draftSchema).max(100), revision: z.number().int().nonnegative() });
export const datasetSchema = z.object({ termLabel: z.string().trim().min(1).max(160), slotSheet: slotSheetSchema, eligibility: eligibilitySchema });
