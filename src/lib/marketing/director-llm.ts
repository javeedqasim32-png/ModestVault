/**
 * OpenAI-backed planning call for the Marketing Director.
 *
 * Uses gpt-4o for strategic reasoning (the Director's core job).
 * gpt-4o-mini is cheaper but its planning quality falls off noticeably
 * for multi-step strategy tasks — the Director benefits from the
 * bigger model. CopyAgent still uses mini for individual captions.
 *
 * Follows the same "direct fetch, no SDK" pattern as
 * src/lib/ai-cover-worker.ts and src/lib/marketing/agents/copy.ts.
 *
 * Cost per Director run (approximate):
 *   Input:  ~2500 tokens × $2.50/M = $0.006
 *   Output: ~1500 tokens × $10/M   = $0.015
 *   Total:  ~$0.02 per run → $0.60/mo on a daily schedule
 */

export const DIRECTOR_MODEL = "gpt-4o" as const;

/** Pricing per million tokens for the DIRECTOR_MODEL, USD. */
const PRICING = {
    inputPerM: 2.5,
    outputPerM: 10,
};

export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
    return (
        (inputTokens / 1_000_000) * PRICING.inputPerM +
        (outputTokens / 1_000_000) * PRICING.outputPerM
    );
}

/**
 * Call OpenAI Chat Completions with structured-JSON mode for the
 * Director's strategic plan. Throws on any transport / parse error —
 * caller handles the fallback path.
 */
export async function callDirectorLLM(input: {
    systemPrompt: string;
    userPrompt: string;
    maxOutputTokens?: number;
}): Promise<{
    rawText: string;
    inputTokens: number;
    outputTokens: number;
    model: string;
}> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error(
            "OPENAI_API_KEY is required for the Marketing Director. Add it to .env.",
        );
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: DIRECTOR_MODEL,
            messages: [
                { role: "system", content: input.systemPrompt },
                { role: "user", content: input.userPrompt },
            ],
            // response_format=json_object forces valid JSON output —
            // no ```json fences to strip, no trailing prose.
            response_format: { type: "json_object" },
            temperature: 0.7,
            max_tokens: input.maxOutputTokens ?? 3000,
        }),
    });

    if (!res.ok) {
        const errBody = await res.text().catch(() => "<no body>");
        throw new Error(
            `OpenAI Director call failed ${res.status}: ${errBody.slice(0, 300)}`,
        );
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== "string" || text.length === 0) {
        throw new Error("OpenAI Director returned empty content");
    }

    return {
        rawText: text,
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        model: data.model ?? DIRECTOR_MODEL,
    };
}
