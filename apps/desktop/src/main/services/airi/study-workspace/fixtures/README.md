# Document fixtures

`lesson.pdf` contains 12 physical pages. Page 1 contains Vietnamese text, pages 2–11 contain numbered lesson text, and page 12 is blank.
ReportLab generated the file with its invariant mode and an embedded Noto Sans font. It contains no personal data.
The fixture supports page ranges, Unicode extraction, empty-page errors, and saved source citations.

`lesson.docx` contains seven nonempty body paragraphs: two headings, two text paragraphs, two table-cell paragraphs, and a paragraph with split runs and a line break.
The document also contains an empty body paragraph and header/footer text, which extraction excludes.
Python-docx generated this synthetic document with Angela as its author. It contains no personal data.

`many-paragraphs.docx` contains 501 body paragraphs, from `Lesson 1` to `Lesson 501`.
Python-docx generated this fixture for search limits and paragraph continuation.
