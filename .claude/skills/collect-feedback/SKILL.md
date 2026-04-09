---
name: collect-feedback
description: Collect false positive/negative feedback after a video cleanup run and save lessons to feedback.json for future classifier improvement
user-invocable: false
---

# Collect Feedback

After reporting results from a cleanup run, collect user feedback on detection accuracy and persist lessons for future runs.

## Steps

### 1. Ask about false positives

Ask the user using `AskUserQuestion`:

> **Were there any false positives?** — segments the tool flagged that it should have kept (wrong detections, hallucinated descriptions, misclassified content)

Offer: "Yes — describe them", "No", "Skip".

### 2. Ask about false negatives

Ask the user using `AskUserQuestion`:

> **Were there any false negatives?** — segments the tool missed that should have been flagged

Offer: "Yes — describe them", "No", "Skip".

### 3. Save feedback entries

If the user provides feedback for either question, append entries to `.claude/rules/feedback.json` (create it if it doesn't exist, otherwise read and extend the existing array). Each entry has:

```json
{
  "date": "YYYY-MM-DD",
  "video": "<video filename>",
  "type": "graphics" | "promotions" | "music",
  "issue": "false_positive" | "false_negative",
  "lesson": "<concise rule for classifiers to apply in future runs, written as an instruction>"
}
```

The `lesson` field must be written as a direct classifier instruction (e.g. "Do NOT flag content attribution captions like 'FOOTAGE FROM X' as social media lower-thirds"). Derive it from the user's description — make it actionable and general enough to apply to similar cases in future videos.

### 4. Confirm

After saving, confirm to the user how many feedback entries were added and where the file is (`.claude/rules/feedback.json`).
