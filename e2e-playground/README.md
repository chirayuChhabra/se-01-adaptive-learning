# Class 9 end-to-end playground

The source is [Journey-Inside-the-Atom.md](Journey-Inside-the-Atom.md): the chapter, chapter check, depth questions and routing rules live in this one file. The build produces the student pages.

```sh
npm ci                      # Node 24+
bun run e2e
# Open the URL printed in the terminal
```

Students read the chapter, answer the six-question chapter check, then press **Complete chapter**. Only then does the result pop-up appear, with the chapter profile and a link to the suggested depth. They can continue to that depth's questions. Answers are saved on the same device and work offline. Alternatively, open `dist/e2e-playground/chapter.html` directly, keeping the output folder together.

Select **Restart quiz** and confirm to clear that quiz's saved answers and take it again. Other quizzes remain saved.

The chapter check's latest answers determine the recommendation: below 50% goes to depth 1, 50–under 70% to depth 2, 70–under 85% to depth 3, and 85% or more to depth 4. The six equally weighted questions mean possible marks are multiples of one sixth. A student can retry the chapter check to update the recommendation. Depth practice does not change the chapter-check mark. These thresholds are demonstration choices, not calibrated mastery levels.

The [AI authoring prompt](AI-AUTHORING.md) describes how to add more depth questions. This example was authored from the repository's [Class 9 research](../exampleContent/journey-inside-the-atom/README.md); no AI call is needed during student use, and the older AI authoring command does not yet automate this single-file workflow. Teachers should review the lesson and questions before classroom use.

This is local practice: answers and answer keys are stored on the device. There is no sync, teacher dashboard or secure exam. The local HTTP URL requires the server; direct-file output works without it. Changing the chapter revision starts a fresh local history.
