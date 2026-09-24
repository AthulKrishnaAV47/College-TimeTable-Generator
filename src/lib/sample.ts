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
19AI304     | SBC       | I
19AI305     | SBC       | I
19AI307     | SBC       | I
19AI403     | FC        | I
19AI405     | SBC       | I
19AI407     | FC        | I
19AI410     | SBC       | I
19AI414     | SBC       | I
19BM301     | SBC       | I
19BM803     | SBC       | I
19CE803     | SBC       | I
19CE810     | SBC       | I
19CS305     | FC        | I
19CS405     | SBC       | I
19CS406     | SBC       | I
19CS547     | FC        | I
19CY205     | FC        | I
19CY208     | FC        | I
19CY801     | FC        | I
19CY802     | FC        | I
19CY805     | FC        | I
19EC302     | FC        | I
19EC402     | FC        | I
19EC408     | SBC       | I
19EC419     | SBC       | I
19EC801     | SBC       | I
19EC802     | FC        | I
19EE301     | SBC       | I
19EE305     | FC        | I
19EE306     | FC        | I
19EE404     | FC        | I
19EE411     | SBC       | I
19EE804     | SBC       | I
19EN101     | SBC       | I
19EN106     | SBC       | I
19EN107     | SBC       | I
19EN616     | SBC       | I
19EY708     | SBC       | I
19HS801     | FC        | I
19MA201     | FC        | I
19MA211     | FC        | I
19MA212     | FC        | I
19MA220     | FC        | I
19MA222     | FC        | I
19MA223     | FC        | I
19MA224     | FC        | I
19ME414     | FC        | I
19PH211     | FC        | I
19PH216     | FC        | I
19PH802     | FC        | I
19PH814     | FC        | I
19TD603     | FC        | I
19TD605     | FC        | I
19TD608     | FC        | I
19AG305     | FC        | II & III
19AG410     | FC        | II & III
19AG411     | FC        | II & III
19AG415     | FC        | II & III
19AG417     | FC        | II & III
19AG418     | FC        | II & III
19AG419     | SBC       | II & III
19AG422     | FC        | II & III
19AG816     | FC        | II & III
19AI301     | SBC       | II & III
19AI302     | FC        | II & III
19AI303     | FC        | II & III
19AI304     | SBC       | II & III
19AI305     | SBC       | II & III
19AI307     | SBC       | II & III
19AI403     | FC        | II & III
19AI404     | SBC       | II & III
19AI405     | SBC       | II & III
19AI406     | FC        | II & III
19AI407     | FC        | II & III
19AI408     | SBC       | II & III
19AI409     | SBC       | II & III
19AI410     | SBC       | II & III
19AI411     | SBC       | II & III
19AI412     | SBC       | II & III
19AI413     | SBC       | II & III
19AI414     | SBC       | II & III
19AI502     | FC        | II & III
19AI505     | SBC       | II & III
19AI509     | FC        | II & III
19AI513     | FC        | II & III
19AI516     | FC        | II & III
19AI534     | FC        | II & III
19AI539     | FC        | II & III
19AI540     | FC        | II & III
19AI541     | SBC       | II & III
19AI543     | FC        | II & III
19AI545     | FC        | II & III
19AI547     | FC        | II & III
19AI550     | FC        | II & III
19AI553     | FC        | II & III
19AI555     | FC        | II & III
19AI603     | FC        | II & III
19AI604     | FC        | II & III
19AI801     | FC        | II & III
19AM401     | FC        | II & III
19AM508     | FC        | II & III
19AM509     | FC        | II & III
19BM401     | FC        | II & III
19BM407     | FC        | II & III
19BM408     | SBC       | II & III
19BM412     | FC        | II & III
19BM501     | FC        | II & III
19BM519     | FC        | II & III
19BM520     | FC        | II & III
19BM809     | SBC       | II & III
19BY202     | FC        | II & III
19CE303     | FC        | II & III
19CE406     | FC        | II & III
19CE414     | FC        | II & III
19CE415     | SBC       | II & III
19CE416     | SBC       | II & III
19CE418     | FC        | II & III
19CE539     | FC        | II & III
19CE547     | FC        | II & III
19CE701     | SBC       | II & III
19CE807     | FC        | II & III
19CH406     | SBC       | II & III
19CH409     | FC        | II & III
19CH412     | SBC       | II & III
19CH413     | FC        | II & III
19CH415     | SBC       | II & III
19CH522     | FC        | II & III
19CH552     | FC        | II & III
19CH701     | SBC       | II & III
19CS304     | FC        | II & III
19CS305     | FC        | II & III
19CS404     | SBC       | II & III
19CS405     | SBC       | II & III
19CS406     | SBC       | II & III
19CS407     | FC        | II & III
19CS408     | FC        | II & III
19CS409     | FC        | II & III
19CS415     | SBC       | II & III
19CS416     | FC        | II & III
19CS417     | FC        | II & III
19CS418     | FC        | II & III
19CS419     | FC        | II & III
19CS420     | FC        | II & III
19CS421     | FC        | II & III
19CS504     | FC        | II & III
19CS509     | FC        | II & III
19CS529     | FC        | II & III
19CS542     | FC        | II & III
19CS543     | FC        | II & III
19CS545     | FC        | II & III
19CS547     | FC        | II & III
19CS549     | FC        | II & III
19CS565     | FC        | II & III
19CS570     | FC        | II & III
19CS579     | FC        | II & III
19CS580     | FC        | II & III
19CS581     | FC        | II & III
19CY205     | FC        | II & III
19CY208     | FC        | II & III
19CY801     | FC        | II & III
19CY802     | FC        | II & III
19CY805     | FC        | II & III
19EC302     | FC        | II & III
19EC305     | FC        | II & III
19EC306     | FC        | II & III
19EC307     | FC        | II & III
19EC308     | FC        | II & III
19EC401     | FC        | II & III
19EC402     | FC        | II & III
19EC404     | FC        | II & III
19EC406     | SBC       | II & III
19EC408     | SBC       | II & III
19EC409     | SBC       | II & III
19EC410     | SBC       | II & III
19EC411     | FC        | II & III
19EC412     | FC        | II & III
19EC413     | FC        | II & III
19EC415     | FC        | II & III
19EC419     | SBC       | II & III
19EC420     | FC        | II & III
19EC421     | SBC       | II & III
19EC424     | SBC       | II & III
19EC503     | FC        | II & III
19EC507     | FC        | II & III
19EC511     | FC        | II & III
19EC519     | FC        | II & III
19EC520     | FC        | II & III
19EC521     | FC        | II & III
19EC522     | FC        | II & III
19EC524     | FC        | II & III
19EC526     | FC        | II & III
19EC603     | FC        | II & III
19EC604     | FC        | II & III
19EC605     | FC        | II & III
19EC606     | FC        | II & III
19EC801     | SBC       | II & III
19EC802     | FC        | II & III
19EC803     | FC        | II & III
19EC806     | FC        | II & III
19EC819     | FC        | II & III
19EC820     | FC        | II & III
19EE301     | SBC       | II & III
19EE305     | FC        | II & III
19EE306     | FC        | II & III
19EE308     | FC        | II & III
19EE309     | FC        | II & III
19EE311     | FC        | II & III
19EE312     | FC        | II & III
19EE404     | FC        | II & III
19EE407     | FC        | II & III
19EE412     | FC        | II & III
19EE413     | FC        | II & III
19EE414     | FC        | II & III
19EE415     | FC        | II & III
19EE416     | SBC       | II & III
19EE511     | FC        | II & III
19EE512     | FC        | II & III
19EE532     | FC        | II & III
19EE806     | FC        | II & III
19EE830     | FC        | II & III
19EI404     | FC        | II & III
19EI407     | FC        | II & III
19EI411     | SBC       | II & III
19EI413     | SBC       | II & III
19EI414     | SBC       | II & III
19EI416     | FC        | II & III
19EI417     | FC        | II & III
19EN101     | SBC       | II & III
19EN106     | SBC       | II & III
19EN107     | SBC       | II & III
19EN609     | FC        | II & III
19EN616     | SBC       | II & III
19EN618     | FC        | II & III
19EN624     | SBC       | II & III
19EY708     | SBC       | II & III
19EY709     | FC        | II & III
19EY710     | FC        | II & III
19EY711     | FC        | II & III
19HS602     | FC        | II & III
19HS801     | FC        | II & III
19IT406     | FC        | II & III
19IT505     | FC        | II & III
19MA201     | FC        | II & III
19MA204     | FC        | II & III
19MA211     | FC        | II & III
19MA217     | FC        | II & III
19MA219     | FC        | II & III
19MA220     | FC        | II & III
19MA222     | FC        | II & III
19MA223     | FC        | II & III
19MA224     | FC        | II & III
19MD402     | FC        | II & III
19MD403     | FC        | II & III
19ME306     | FC        | II & III
19ME410     | FC        | II & III
19ME411     | SBC       | II & III
19ME415     | FC        | II & III
19ME503     | FC        | II & III
19ME509     | FC        | II & III
19ME521     | SBC       | II & III
19ME529     | FC        | II & III
19ME531     | FC        | II & III
19ME533     | FC        | II & III
19ME535     | SBC       | II & III
19ME536     | FC        | II & III
19ME571     | SBC       | II & III
19ME573     | SBC       | II & III
19ME701     | SBC       | II & III
19MS154     | FC        | II & III
19MS155     | FC        | II & III
19MS156     | FC        | II & III
19PH209     | FC        | II & III
19PH211     | FC        | II & III
19PH213     | FC        | II & III
19PH214     | FC        | II & III
19PH215     | FC        | II & III
19PH216     | FC        | II & III
19PH601     | FC        | II & III
19PH602     | FC        | II & III
19PH802     | FC        | II & III
19PH814     | FC        | II & III
19TD603     | FC        | II & III
19TD605     | FC        | II & III
19TD608     | FC        | II & III
19TD609     | FC        | II & III
19CH803     | FC        | II & III
19MD406     | SBC       | II & III
19MA213     | FC        | II & III
19CH404     | FC        | II & III
19ME407     | SBC       | II & III
19ME403     | SBC       | II & III
19ME405     | SBC       | II & III`;
