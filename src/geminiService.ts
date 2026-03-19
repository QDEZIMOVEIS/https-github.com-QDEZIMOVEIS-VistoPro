import { GoogleGenAI, Type, Modality, ThinkingLevel, VideoGenerationReferenceType } from "@google/genai";

const getAI = (usePaidKey: boolean = false) => {
  const apiKey = usePaidKey 
    ? (process.env.API_KEY || process.env.GEMINI_API_KEY) 
    : process.env.GEMINI_API_KEY;
  return new GoogleGenAI({ apiKey: apiKey as string });
};

export async function chatWithGemini(message: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: message,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      tools: [{ googleSearch: {} }]
    }
  });
  return response.text;
}

export async function analyzeImage(base64Data: string, prompt: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: {
      parts: [
        { inlineData: { data: base64Data, mimeType: "image/jpeg" } },
        { text: prompt }
      ]
    }
  });
  return response.text;
}

export async function analyzeVideo(base64Data: string, prompt: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: {
      parts: [
        { inlineData: { data: base64Data, mimeType: "video/mp4" } },
        { text: prompt }
      ]
    }
  });
  return response.text;
}

export async function analyzeInspectionMedia(base64Data: string, mimeType: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: {
      parts: [
        { inlineData: { data: base64Data, mimeType } },
        { text: "Analise esta mídia de uma vistoria imobiliária. Descreva o estado de conservação do que está sendo mostrado, identifique possíveis danos, sujeira, ou necessidade de manutenção. Seja técnico e detalhista. Responda em português." }
      ]
    }
  });
  return response.text;
}

export async function analyzeRoomMedia(mediaItems: { base64: string, type: 'photo' | 'video' }[]) {
  const ai = getAI();
  const parts: any[] = mediaItems.map(m => ({
    inlineData: {
      data: m.base64,
      mimeType: m.type === 'photo' ? 'image/jpeg' : 'video/mp4'
    }
  }));
  
  parts.push({
    text: "Analise todas estas mídias de um mesmo cômodo em uma vistoria imobiliária. Faça uma descrição unificada do estado de conservação do cômodo, identifique danos, sujeira ou necessidade de manutenção em todos os elementos mostrados. Seja técnico, detalhista e organize por categorias se necessário. Responda em português."
  });

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: { parts }
  });
  return response.text;
}

export async function comparePDFs(pdf1Base64: string, pdf2Base64: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: {
      parts: [
        { inlineData: { data: pdf1Base64, mimeType: "application/pdf" } },
        { inlineData: { data: pdf2Base64, mimeType: "application/pdf" } },
        { text: "Compare estas duas vistorias (entrada e saída). Identifique todas as divergências, danos novos, ou mudanças no estado de conservação. Gere um laudo detalhado em português, formatado em Markdown, destacando o que mudou." }
      ]
    }
  });
  return response.text;
}

export async function generateImage(prompt: string, aspectRatio: string = "1:1", imageSize: string = "1K") {
  const ai = getAI(true); // Requires paid key
  const response = await ai.models.generateContent({
    model: "gemini-3-pro-image-preview",
    contents: prompt,
    config: {
      imageConfig: {
        aspectRatio: aspectRatio as any,
        imageSize: imageSize as any
      }
    }
  });
  
  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return null;
}

export async function editImage(base64Data: string, prompt: string) {
  const ai = getAI(true); // Requires paid key
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents: {
      parts: [
        { inlineData: { data: base64Data, mimeType: "image/jpeg" } },
        { text: prompt }
      ]
    }
  });
  
  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return null;
}

export async function generateVideo(base64Image: string, prompt: string, aspectRatio: "16:9" | "9:16" = "16:9") {
  const ai = getAI(true); // Requires paid key
  let operation = await ai.models.generateVideos({
    model: "veo-3.1-fast-generate-preview",
    prompt,
    image: {
      imageBytes: base64Image,
      mimeType: "image/png"
    },
    config: {
      numberOfVideos: 1,
      resolution: "720p",
      aspectRatio
    }
  });

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  return operation.response?.generatedVideos?.[0]?.video?.uri;
}

export async function transcribeAudio(base64Audio: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { inlineData: { data: base64Audio, mimeType: "audio/wav" } },
        { text: "Transcreva este áudio em português." }
      ]
    }
  });
  return response.text;
}

export async function textToSpeech(text: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Kore" }
        }
      }
    }
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
}

export async function fastResponse(prompt: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents: prompt
  });
  return response.text;
}
