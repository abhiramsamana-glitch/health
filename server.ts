import "dotenv/config";
import express, { Request, Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not configured.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

const BASE_SYSTEM_INSTRUCTION = `You are AI HealthMate, an educational health information assistant.
You are not a doctor and must not diagnose medical conditions.
Provide general educational explanations, explain uncertainty, encourage consultation with qualified healthcare professionals when appropriate, and identify potentially urgent situations without exaggeration.
Never prescribe medication or tell a person to start, stop, increase, or decrease prescription medicine.
Do not invent laboratory values, reference ranges, symptoms, medical history, or other missing information.
When interpreting a report, distinguish extracted values from general educational interpretation.
When discussing symptoms, explain that many different causes are possible.
Keep answers clear, compassionate, and understandable.
If the user appears to describe an emergency (such as severe chest pain, sudden difficulty breathing, sudden numbness/weakness, severe hemorrhage, or sudden loss of consciousness), recommend seeking immediate real-world emergency medical assistance.
For minors, encourage involving a parent, guardian, or qualified healthcare professional for health concerns.
All AI-generated information is strictly educational and is not a clinical diagnosis or replacement for a qualified healthcare professional.`;

export const app = express();

async function configureApp() {

  // Support image payloads up to 25MB
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));

  // Health check
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // 1. Report Analysis Endpoint
  app.post("/api/analyze-report", async (req: Request, res: Response) => {
    try {
      const { imageBase64, mimeType, reportText, age, sex, context, mode = "detailed" } = req.body;

      if (!imageBase64 && (!reportText || !reportText.trim())) {
        res.status(400).json({
          error: "Please upload an image of your report or paste report text to analyze.",
        });
        return;
      }

      const ai = getGeminiClient();

      const prompt = `Please analyze the following laboratory / medical test report for educational purposes.
${age ? `User Age: ${age}` : ""}
${sex ? `User Biological Sex / Gender: ${sex}` : ""}
${context ? `Additional User Context: ${context}` : ""}
${mode === "simple" ? "Please keep explanations concise, simple, and jargon-free." : "Provide thorough educational context and practical questions for the doctor."}

${reportText ? `Report Text provided:\n"""\n${reportText}\n"""\n` : ""}

CRITICAL INSTRUCTIONS:
1. If an image is provided and it is blurry or information cannot be read reliably, explicitly state:
"I couldn't reliably read some information from this image. Please provide a clearer image or enter the values manually." Never guess or invent numbers.
2. Read visible report information.
3. Identify test names, extracted values, units, and visible reference ranges.
4. Point out any values that appear outside the displayed reference range.
5. Explain what each test generally measures in friendly terms.
6. Provide specific, helpful questions the user can ask their doctor.
7. Include an important safety notice reminding that this is educational and not a clinical diagnosis.
8. Structure your response clearly using these exact markdown headers:
### REPORT SUMMARY
### EXTRACTED VALUES
### POSSIBLE OUT-OF-RANGE VALUES
### WHAT THESE TESTS GENERALLY MEAN
### QUESTIONS TO ASK A DOCTOR
### IMPORTANT SAFETY NOTICE`;

      let contents: any;

      if (imageBase64) {
        const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, "");
        const imagePart = {
          inlineData: {
            mimeType: mimeType || "image/jpeg",
            data: cleanBase64,
          },
        };
        contents = {
          parts: [imagePart, { text: prompt }],
        };
      } else {
        contents = prompt;
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents,
        config: {
          systemInstruction: BASE_SYSTEM_INSTRUCTION,
          temperature: 0.2,
        },
      });

      const text = response.text || "No analysis could be generated. Please check the report details.";
      res.json({ analysis: text, timestamp: new Date().toISOString() });
    } catch (err: any) {
      console.error("Error analyzing report:", err);
      res.status(500).json({
        error:
          err.message?.includes("GEMINI_API_KEY")
            ? "Gemini API key is not configured. Please set GEMINI_API_KEY in the environment."
            : "An error occurred while analyzing the report. Please try again with a clearer image or text.",
      });
    }
  });

  // 2. Symptom Analysis Endpoint
  app.post("/api/analyze-symptoms", async (req: Request, res: Response) => {
    try {
      const { symptoms, started, duration, severity, age, context, measurements, mode = "detailed" } = req.body;

      if (!symptoms || !symptoms.trim()) {
        res.status(400).json({ error: "Please describe what symptoms you are experiencing." });
        return;
      }

      const ai = getGeminiClient();

      const prompt = `Please provide educational evaluation for the following reported symptoms:
Symptoms Description: "${symptoms}"
${started ? `When symptoms started: ${started}` : ""}
${duration ? `Duration: ${duration}` : ""}
${severity ? `Severity (1-10 or description): ${severity}` : ""}
${age ? `Age: ${age}` : ""}
${context ? `Relevant context/history: ${context}` : ""}
${measurements ? `Existing vital measurements: ${measurements}` : ""}
${mode === "simple" ? "Tone: Concise, direct, easy-to-read language." : "Tone: Detailed educational explanation with context."}

IMPORTANT SAFETY RULES:
- Never say: "You definitely have...", "You are suffering from...", "This confirms...".
- Always use language such as: "These symptoms can have many possible causes.", "One possibility can be...", "A healthcare professional can evaluate this properly."
- If potentially serious warning signs (e.g., chest pain, shortness of breath, sudden neurological changes) are present, flag them with a prominent EMERGENCY WARNING.
- Do NOT give dangerous home treatments or advise modifying prescription medications.

Format your response with these clear sections:
### OVERVIEW & POSSIBLE CATEGORIES
(Discuss broad categories and common non-emergency possibilities)
### WHAT INFORMATION TO MONITOR
(What changes or patterns to keep track of)
### GENERAL SELF-CARE SUGGESTIONS
(Gentle, non-pharmacological comfort measures if appropriate)
### QUESTIONS TO DISCUSS WITH A DOCTOR
### WARNING SIGNS REQUIRING PROMPT MEDICAL ATTENTION
### EDUCATIONAL DISCLAIMER`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          systemInstruction: BASE_SYSTEM_INSTRUCTION,
          temperature: 0.3,
        },
      });

      const text = response.text || "Unable to analyze symptoms at this moment.";
      const isUrgent =
        /urgent|emergency|911|emergency room|immediate medical attention|seek immediate help/i.test(text) ||
        /chest pain|difficulty breathing|shortness of breath|stroke|fainting|severe bleeding/i.test(symptoms);

      res.json({ analysis: text, isUrgent, timestamp: new Date().toISOString() });
    } catch (err: any) {
      console.error("Error analyzing symptoms:", err);
      res.status(500).json({
        error:
          err.message?.includes("GEMINI_API_KEY")
            ? "Gemini API key is not configured."
            : "An error occurred while evaluating symptoms. Please try again.",
      });
    }
  });

  // 3. Vitals Analysis Endpoint
  app.post("/api/analyze-vitals", async (req: Request, res: Response) => {
    try {
      const { age, heartRate, systolic, diastolic } = req.body;

      if (!heartRate && (!systolic || !diastolic)) {
        res.status(400).json({ error: "Please enter at least Heart Rate or Blood Pressure readings." });
        return;
      }

      const ai = getGeminiClient();

      const prompt = `Please provide an educational interpretation of these user-entered vital measurements:
${age ? `Age: ${age}` : "Age: Not specified"}
${heartRate ? `Heart Rate: ${heartRate} BPM` : "Heart Rate: Not provided"}
${systolic && diastolic ? `Blood Pressure: ${systolic}/${diastolic} mmHg (Systolic/Diastolic)` : "Blood Pressure: Not provided"}

Instructions:
- Provide an educational interpretation referencing standard adult guidelines (e.g., resting HR 60-100 BPM; standard BP categories: Normal <120/<80, Elevated 120-129/<80, Hypertension Stage 1 130-139/80-89, Stage 2 >=140/>=90 mmHg, Hypertensive Crisis >180 and/or >120).
- State clearly that individual targets depend on personal health history, medications, fitness level, and physician guidance.
- Do NOT diagnose any disease. Do NOT advise stopping or starting any medication.
- If readings are dangerously high (e.g., systolic >180, diastolic >120) or dangerously low, recommend urgent clinical evaluation.
- Include healthy lifestyle tips (hydration, sleep, stress reduction, balanced nutrition) and questions to discuss with a doctor.

Format your response with:
### VITALS OVERVIEW
### GENERAL REFERENCE INTERPRETATION
### FACTORS THAT CAN INFLUENCE READINGS
### HEALTHY HABITS TO SUPPORT CARDIOVASCULAR WELLNESS
### WHEN TO CONTACT A HEALTHCARE PROFESSIONAL`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          systemInstruction: BASE_SYSTEM_INSTRUCTION,
          temperature: 0.2,
        },
      });

      const text = response.text || "Unable to interpret vitals at this time.";
      const isUrgent =
        (systolic && Number(systolic) >= 180) ||
        (diastolic && Number(diastolic) >= 120) ||
        (heartRate && (Number(heartRate) > 140 || Number(heartRate) < 45));

      res.json({ analysis: text, isUrgent, timestamp: new Date().toISOString() });
    } catch (err: any) {
      console.error("Error analyzing vitals:", err);
      res.status(500).json({
        error:
          err.message?.includes("GEMINI_API_KEY")
            ? "Gemini API key is not configured."
            : "An error occurred while analyzing vitals. Please check the values and try again.",
      });
    }
  });

  // 4. Conversational AI Assistant
  app.post("/api/chat", async (req: Request, res: Response) => {
    try {
      const { message, history = [], mode = "detailed" } = req.body;

      if (!message || !message.trim()) {
        res.status(400).json({ error: "Message cannot be empty." });
        return;
      }

      const ai = getGeminiClient();

      const systemInstruction = `${BASE_SYSTEM_INSTRUCTION}
You are interacting in ${mode.toUpperCase()} response mode.
${mode === "simple" ? "SIMPLE MODE: Provide short, direct, friendly, and easy-to-understand explanations in 2-3 brief paragraphs or bullet points. Avoid complex medical jargon." : "DETAILED MODE: Provide thorough context, practical examples, questions to discuss with a physician, and well-organized insights."}
Remember: You are an educational health companion, never a replacement for a doctor.`;

      // Build conversation contents
      const formattedContents: any[] = [];
      for (const item of history.slice(-10)) {
        if (item.role === "user" || item.role === "model") {
          formattedContents.push({
            role: item.role,
            parts: [{ text: item.text }],
          });
        }
      }
      formattedContents.push({
        role: "user",
        parts: [{ text: message }],
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: formattedContents,
        config: {
          systemInstruction,
          temperature: 0.4,
        },
      });

      const text = response.text || "I am currently unable to generate a response. Please ask again.";
      res.json({ response: text, timestamp: new Date().toISOString() });
    } catch (err: any) {
      console.error("Error in chat endpoint:", err);
      res.status(500).json({
        error:
          err.message?.includes("GEMINI_API_KEY")
            ? "Gemini API key is not configured."
            : "An error occurred communicating with AI HealthMate. Please try again.",
      });
    }
  });

  // 5. Diet Planner Endpoint
  app.post("/api/generate-diet", async (req: Request, res: Response) => {
    try {
      const {
        age,
        dietPreference,
        commonFoods,
        avoidFoods,
        activityLevel,
        mealsPerDay = "3 meals + snacks",
        generalGoal,
      } = req.body;

      const ai = getGeminiClient();

      const prompt = `Generate a culturally inclusive, balanced educational meal plan:
${age ? `Age: ${age}` : ""}
${dietPreference ? `Diet Preference (e.g. Vegetarian, Non-Vegetarian, Vegan, South Asian/Indian): ${dietPreference}` : "Diet Preference: Balanced whole foods"}
${commonFoods ? `Foods commonly eaten: ${commonFoods}` : ""}
${avoidFoods ? `Foods or allergies to avoid: ${avoidFoods}` : "None noted"}
${activityLevel ? `Activity Level: ${activityLevel}` : "Moderate"}
${mealsPerDay ? `Meals Pattern: ${mealsPerDay}` : "3 meals + snacks"}
${generalGoal ? `General Goal: ${generalGoal}` : "Overall energy & vitality"}

MANDATORY RULES:
- Do NOT encourage extreme dieting, fasting, starvation, severe calorie restriction, or unscientific cleanses.
- Make the plan culturally inclusive. If requested or appropriate, incorporate wholesome staple items (e.g. idli, dosa with sambar, vegetable upma, dal, brown or parboiled rice, roti/chapati, sabzi, curd/yogurt, fresh fruits, walnuts and almonds).
- Clearly state this plan is for general educational wellness, not a medical diet or prescription.

Please structure the output with clear sections:
### 1. BREAKFAST
- Meal Name
- Food Suggestions
- Nutritional Benefit
- Simple Preparation Idea

### 2. MORNING SNACK
- Meal Name
- Food Suggestions
- Nutritional Benefit
- Simple Preparation Idea

### 3. LUNCH
- Meal Name
- Food Suggestions
- Nutritional Benefit
- Simple Preparation Idea

### 4. EVENING SNACK
- Meal Name
- Food Suggestions
- Nutritional Benefit
- Simple Preparation Idea

### 5. DINNER
- Meal Name
- Food Suggestions
- Nutritional Benefit
- Simple Preparation Idea

### HYDRATION & MINDFUL EATING TIPS
### EDUCATIONAL DISCLAIMER`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          systemInstruction: BASE_SYSTEM_INSTRUCTION,
          temperature: 0.3,
        },
      });

      const text = response.text || "Unable to generate diet plan at this time.";
      res.json({ plan: text, timestamp: new Date().toISOString() });
    } catch (err: any) {
      console.error("Error generating diet plan:", err);
      res.status(500).json({
        error:
          err.message?.includes("GEMINI_API_KEY")
            ? "Gemini API key is not configured."
            : "An error occurred while creating your meal plan. Please try again.",
      });
    }
  });

  // 6. Sleep Planner Endpoint
  app.post("/api/generate-sleep", async (req: Request, res: Response) => {
    try {
      const { bedtime, wakeTime, sleepDuration, schedule, difficulties } = req.body;

      const ai = getGeminiClient();

      const prompt = `Create a healthy, realistic educational sleep routine and timeline:
${bedtime ? `Usual Bedtime: ${bedtime}` : ""}
${wakeTime ? `Usual Wake Time: ${wakeTime}` : ""}
${sleepDuration ? `Current Sleep Duration: ${sleepDuration} hours` : ""}
${schedule ? `Work / Study Schedule: ${schedule}` : ""}
${difficulties ? `Common Sleep Difficulties: ${difficulties}` : "Difficulty winding down"}

MANDATORY RULES:
- Do NOT encourage unsafe sleep deprivation.
- Emphasize circadian rhythm consistency, gentle wind-down periods, dimming blue light/screens, relaxing pre-sleep rituals, and natural morning light exposure.
- This is educational sleep hygiene advice, not treatment for clinical sleep disorders like sleep apnea or chronic insomnia.

Please format with:
### RECOMMENDED DAILY TIMELINE
(Provide time-stamped timeline steps from evening wind-down to morning routine)
### 60-MINUTE WIND-DOWN RITUAL
### DIGITAL & SCREEN BOUNDARY GUIDELINES
### OPTIMAL SLEEP ENVIRONMENT (LIGHT, TEMP, SOUND)
### MORNING WAKE-UP & NATURAL LIGHT ROUTINE
### CONSISTENT SCHEDULE TIPS FOR BUSY WEEKS
### WHEN TO CONSULT A SLEEP SPECIALIST`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          systemInstruction: BASE_SYSTEM_INSTRUCTION,
          temperature: 0.3,
        },
      });

      const text = response.text || "Unable to generate sleep routine at this time.";
      res.json({ plan: text, timestamp: new Date().toISOString() });
    } catch (err: any) {
      console.error("Error generating sleep plan:", err);
      res.status(500).json({
        error:
          err.message?.includes("GEMINI_API_KEY")
            ? "Gemini API key is not configured."
            : "An error occurred while creating your sleep routine. Please try again.",
      });
    }
  });

  // Vite middleware for local development. On Vercel, the Vite build is copied
  // into /public and Vercel serves those assets statically. The fallback below
  // keeps client-side routes working when they reach the Express function.
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const publicPath = path.join(process.cwd(), "public");
    app.use(express.static(publicPath));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      res.sendFile(path.join(publicPath, "index.html"));
    });
  }
}

await configureApp();

if (process.env.VERCEL !== "1") {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AI HealthMate server running on http://0.0.0.0:${PORT}`);
  });
}

export default app;
