/**
 * Realistic sample inputs reproducing the exact structures from the product
 * spec (§2), extended with every documented irregularity:
 *  - two contiguous 1-hour cells concatenated with no separator
 *  - a Lecture+Practical pair under one faculty (19AI305 → combo heuristic)
 *  - many alternative sections incl. a two-faculty one (19CS305)
 *  - 1-minute administrative placeholders (19CY801, 19HS801 → self-paced)
 *  - non-standard course code "QNX RTOS" with a single-day date range
 *  - the same course code in two non-adjacent blocks (19AI301 → merged)
 *  - a single-section open elective (19JP301 Japanese)
 */

export const SAMPLE_SLOT_SHEET = `19AI305 [3 Credits]
ENGINEERING SCIENCES - ENGINEERING SCIENCES
Course overview
Advanced C Programming
UG - 04, T1-P3, AI - Trainer 10 .
Date: 21-01-2026 to 28-03-2026
Friday: 15:00 - 16:0016:00 - 17:00
Wednesday: 08:00 - 09:0009:00 - 10:00
UG - 04, T1-L3, AI - Trainer 10 .
Date: 21-01-2026 to 28-03-2026
Monday: 15:00 - 16:0016:00 - 17:00

19CS305 [3 Credits]
PROFESSIONAL ELECTIVE - PROFESSIONAL ELECTIVE PE
Course overview
Computer Architecture
UG - 04, T1-V5, CSE - Sriram K
Date: 21-01-2026 to 28-03-2026
Monday: 10:00 - 11:0011:00 - 12:00
Thursday: 13:00 - 14:0014:00 - 15:00
UG - 04, T1-V6, CSE - Priya R
Date: 21-01-2026 to 28-03-2026
Tuesday: 10:00 - 11:0011:00 - 12:00
Friday: 13:00 - 14:0014:00 - 15:00
UG - 04, T1-V7, CSE - MAHENDRAN K , Baraneedharan .P
Date: 21-01-2026 to 28-03-2026
Wednesday: 13:00 - 14:0014:00 - 15:00
Saturday: 08:00 - 09:0009:00 - 10:00
UG - 04, T1-V8, CSE - Sriram K
Date: 21-01-2026 to 28-03-2026
Monday: 14:00 - 15:0015:00 - 16:00
Thursday: 10:00 - 11:0011:00 - 12:00

19AI301 [4 Credits]
ENGINEERING SCIENCES - ENGINEERING SCIENCES
Course overview
Data Structures
UG - 04, T1-A1, AI - Trainer 1 .
Date: 21-01-2026 to 28-03-2026
Monday: 08:00 - 09:0009:00 - 10:00
Wednesday: 10:00 - 11:0011:00 - 12:00
Friday: 08:00 - 09:00
UG - 04, T1-A2, AI - Trainer 2 .
Date: 21-01-2026 to 28-03-2026
Tuesday: 08:00 - 09:0009:00 - 10:00
Thursday: 10:00 - 11:0011:00 - 12:00
Friday: 09:00 - 10:00

19EE305 [2 Credits]
ENGINEERING SCIENCES - ENGINEERING SCIENCES
Course overview
Digital Electronics Workshop
UG - 04, T1-L1, ECE - Ramesh N
Date: 21-01-2026 to 28-03-2026
Tuesday: 15:00 - 16:0016:00 - 17:00
UG - 04, T1-P1, ECE - Ramesh N
Date: 21-01-2026 to 28-03-2026
Thursday: 15:00 - 16:0016:00 - 17:00

19JP301 [2 Credits]
HUMANITIES - HUMANITIES
Course overview
Japanese N5
UG - 04, T1-J1, HUM - Keiko Tanaka .
Date: 21-01-2026 to 28-03-2026
Saturday: 11:00 - 12:0012:00 - 13:00

19CY801 [2 Credits]
VALUE EDUCATION - ENVIRONMENTAL SCIENCES
Course overview
Environmental Sciences
UG - 04, T1-E1, ENV - Meera S .
Date: 21-01-2026 to 28-03-2026
Wednesday: 17:04 - 17:05
UG - 04, T1-E2, ENV - Meera S .
Date: 21-01-2026 to 28-03-2026
Thursday: 17:04 - 17:05

19HS801 [2 Credits]
VALUE EDUCATION - HUMAN VALUES
Course overview
Human Values
UG - 04, T1-H1, HUM - Anand T .
Date: 21-01-2026 to 28-03-2026
Tuesday: 17:05 - 17:06

19AI410 [3 Credits]
PROFESSIONAL ELECTIVE - PROFESSIONAL ELECTIVE PE
Course overview
Deep Learning
UG - 04, T1-D1, AI - Ramesh N
Date: 21-01-2026 to 28-03-2026
Monday: 09:00 - 10:0010:00 - 11:00
UG - 04, T1-D2, AI - Priya R
Date: 21-01-2026 to 28-03-2026
Tuesday: 14:00 - 15:0015:00 - 16:00
UG - 04, T1-D3, AI - Keiko Tanaka
Date: 21-01-2026 to 28-03-2026
Wednesday: 15:00 - 16:0016:00 - 17:00

QNX RTOS [2 Credits]
ORIENTATION PROGRAM - ORIENTATION PROGRAM
Course overview
QNX RTOS Fundamentals
UG - 04, T1-Q1, CSE - Guest Faculty .
Date: 21-01-2026 to 21-01-2026
Wednesday: 08:00 - 09:0009:00 - 10:0010:00 - 11:0011:00 - 12:00

19AI301 [4 Credits]
ENGINEERING SCIENCES - ENGINEERING SCIENCES
Course overview
Data Structures
UG - 05, T1-A3, AI - Trainer 3 .
Date: 21-01-2026 to 28-03-2026
Monday: 11:00 - 12:00
Wednesday: 14:00 - 15:0015:00 - 16:00`;

export const SAMPLE_ELIGIBILITY = `Course Code | SBC or FC | Year
19AI301     | SBC       | I
19AI302     | FC        | I
19AI303     | FC        | I
19CS305     | FC        | I
19CS305     | FC        | II & III
19EE305     | FC        | I
19AI305     | FC        | I
19JP301     | SBC       | I
19CY801     | FC        | I
19HS801     | FC        | I
19AI410     | FC        | II & III
19DE301     | SBC       | II & III`;
