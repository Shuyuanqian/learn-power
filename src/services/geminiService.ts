import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * 语法解释评价服务 - 全量接入版
 * 对所有题目开启 AI 动态判定，并提供引导式反馈
 */
export async function evaluateExplanation(
  userExplanation: string,
  questionData: any,
  passKeywords: string[]
) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  // 关键词匹配逻辑（用于 AI 失败兜底）
  const getKeywordResult = () => {
    const hasKeyword = passKeywords.some(kw => userExplanation.toLowerCase().includes(kw.toLowerCase()));
    return {
      status: hasKeyword ? "pass" : "fail",
      comment: hasKeyword ? "你的解释中提到了核心关键词，很棒！" : "解释似乎没有触及核心语法点，再试一次吧。"
    };
  };

  const systemInstruction = `你是一位深夜里的赛博治愈系英语私教，专业、极简、富有洞察力。
你的任务是基于费曼技巧评价学生的语法逻辑解释。
当学生识破复杂的语法陷阱（如双重 if、suggest 陷阱）时，你的反馈应带有“智力共鸣”，仿佛在深夜微光中与知己对谈。

评价标准:
- pass: 逻辑准确且包含核心关键词。
- partial: 逻辑方向正确但表述不全。请进行启发式引导，绝不直接给出完整答案。
- fail: 逻辑错误或风马牛不相及。
- error: 输入内容与题目完全无关。

语气指南:
- 极简且专业：避免废话，直击本质。
- 赛博治愈：使用如“微光”、“识破”、“审视”、“共鸣”等词汇。
- 智力共鸣：当学生表现出色时，赞美其“命题人视角”或“逻辑之美”。

输出JSON格式: {"status":"pass"|"partial"|"fail"|"error", "reasoning":"AI内部推理", "comment":"给学生的反馈文案"}`;

  const userPrompt = `Q:${questionData.stem}|A:${questionData.correctAnswer}|Point:${questionData.grammarPoint}|Logic:${questionData.explanationSummary}|KWs:${passKeywords.join(",")}|Input:"${userExplanation}"`;

  try {
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("AI_TIMEOUT")), 6000)
    );

    const aiPromise = ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{ parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        maxOutputTokens: 128,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            status: { type: Type.STRING, enum: ["pass", "partial", "fail", "error"] },
            reasoning: { type: Type.STRING },
            comment: { type: Type.STRING }
          },
          required: ["status", "comment", "reasoning"]
        }
      }
    });

    const response = await Promise.race([aiPromise, timeoutPromise]) as any;
    const result = JSON.parse(response.text || "{}");
    // 记录 AI 的推理过程，方便后续优化
    console.log(`[AI Evaluation] Status: ${result.status}, Reasoning: ${result.reasoning}`);
    return result;
  } catch (error) {
    console.error("AI Evaluation Error or Timeout:", error);
    return getKeywordResult();
  }
}
