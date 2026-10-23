-- Answer notes are now HTML. Index only their text, not tag names or attribute values (hrefs, image URLs).
DROP INDEX "Question_searchVector_idx";
ALTER TABLE "Question" DROP COLUMN "searchVector";
ALTER TABLE "Question" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
  to_tsvector('english', "text" || ' ' || regexp_replace("answerNotes", '<[^>]*>', ' ', 'g'))
) STORED;
CREATE INDEX "Question_searchVector_idx" ON "Question" USING GIN ("searchVector");
