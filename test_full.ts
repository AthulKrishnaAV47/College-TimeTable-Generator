import { readFileSync, writeFileSync } from "fs";
import { parseSlotSheet } from "./src/lib/parse/slotSheet";

// Read the OCR text from a file if it exists, or we can just parse the whole file directly if I save it.
