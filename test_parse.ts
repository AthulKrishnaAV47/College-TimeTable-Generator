import { readFileSync } from "fs";
import { parseSlotSheet } from "./src/lib/parse/slotSheet";

const text = readFileSync("test_data.txt", "utf-8");
const result = parseSlotSheet(text);

console.log(`Parsed ${result.courses.length} courses:`);
for (const course of result.courses) {
  console.log(`Course: ${course.courseCode} (${course.sections.length} sections)`);
  for (const s of course.sections) {
    console.log(`  Section: ${s.slotCode}, Faculty: ${s.faculty.join(", ")}`);
  }
}
if (result.warnings.length > 0) {
  console.log("Warnings:");
  console.log(result.warnings.join("\n"));
}
