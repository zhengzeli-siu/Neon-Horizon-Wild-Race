
import { GoogleGenAI } from "@google/genai";
import { BiomeType } from "../types";

const createClient = () => {
  if (!process.env.API_KEY) {
    console.warn("API_KEY not found in environment variables.");
    return null;
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const getTacticalBriefing = async (biome: BiomeType, carName: string): Promise<string> => {
  const client = createClient();
  if (!client) return "战术系统离线。请小心驾驶。";

  try {
    const prompt = `
      角色设定: 你是一个来自未来的赛车战术指挥AI，正在通过无线电跟驾驶员通话。
      语言要求: 必须使用简体中文 (Simplified Chinese) 回答，不要包含任何英语。
      任务: 玩家正驾驶 "${carName}" 在 "${biome}" 赛道上比赛。
      
      请生成一段简短、沉浸感强、冷静专业的战术简报（不超过50个字）。
      内容包括环境警告（如高温、结冰、路滑）以及驾驶建议。
      风格: 赛博朋克，紧迫。
    `;

    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return response.text || "全速前进，注意安全。";
  } catch (error) {
    console.error("Gemini briefing failed:", error);
    return "通讯链路不稳定。祝你好运，驾驶员。";
  }
};
