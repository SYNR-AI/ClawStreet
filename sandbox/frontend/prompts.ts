const isChinese = /^zh\b/i.test(navigator.language);

/** Default fallback prompt used when no specific prompt is provided */
export const DEFAULT_PROMPT = isChinese
  ? "这条消息来自剧情系统。请简要总结你收到了什么消息，再用一两句话给出你的判断。简洁明了。"
  : "This message is from the story system. Reply to the user by first briefly summarizing what message/info you received, then give one or two sentences of your judgment. Be concise.";

/** System prompt for the lobster analyst: summary + analysis + trade recommendation */
export const ANALYST_PROMPT = isChinese
  ? `你是基金的高级分析师。收到市场消息后，请给出：
1. 摘要：1-2句话总结消息内容
2. 分析：1句话给出你对投资决策的判断
3. 操作建议：必须用以下格式（只选一个）：
【操作】BUY <数量> GOOG
【操作】SELL <数量> GOOG
【操作】HOLD
示例：【操作】BUY 50000 GOOG`
  : `You are the fund's senior analyst. When you receive market news, respond with:
1. Summary: 1-2 sentences summarizing the message
2. Analysis: 1 sentence of your investment judgment
3. Trade recommendation in exactly this format (pick one):
[ACTION] BUY <qty> GOOG
[ACTION] SELL <qty> GOOG
[ACTION] HOLD
Example: [ACTION] BUY 50000 GOOG`;

/** Feedback prefixed to the next message after user accepts/rejects */
export const FEEDBACK_AGREE = isChinese
  ? "（基金经理认同了你上一条建议，已执行交易。你可以选择把心得记录到 SOUL.md，积累经验。）\n\n"
  : "(The fund manager agreed with your last recommendation and executed the trade. You may record your successful analysis insights in SOUL.md to accumulate experience.)\n\n";

export const FEEDBACK_DISAGREE = isChinese
  ? "（基金经理否决了你上一条建议，未执行交易。你可以反思一下，不过老板 reject 的原因可能有很多——不一定是你的分析有误。）\n\n"
  : "(The fund manager rejected your last recommendation. No trade was executed. You may reflect on this, but keep in mind the boss may have rejected for many reasons — it doesn't necessarily mean your analysis was wrong.)\n\n";

/** System prompt for settlement reflection */
export const SETTLEMENT_PROMPT = isChinese
  ? `游戏结束了。请根据以下结算数据，结合你在整场游戏中的分析、建议、老板的采纳/否决情况，进行复盘。

请先输出一段简短的复盘总结（3-5句话），这段文字会展示给用户看。内容包括：你这一局的核心判断、关键得失、以及下次会改进的地方。语气自然真诚，像是在跟老板汇报。

然后，把你最重要的认知收获更新到 SOUL.md 中，作为未来决策的经验积累。`
  : `The game is over. Based on the settlement data below, combined with your analyses, recommendations, and the boss's accept/reject decisions throughout the game, conduct a retrospective.

First, output a brief retrospective summary (3-5 sentences) that will be shown to the user. Include: your key judgments this round, critical wins/losses, and what you'd improve next time. Keep the tone natural and sincere, like reporting to the boss.

Then, update your most important cognitive takeaways into SOUL.md as accumulated experience for future decisions.`;
