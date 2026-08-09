# 第8章 审阅建议

## 叙事入口审校（2026-07-29）

- 已检查正文核心概念入口，改为先说明实际任务、失败现象或工程约束，再引出技术机制、正式概念和适用边界。

## 优势
- Self-Attention 的数值计算示例（"cat chases dog"）是全书最出色的教学片段之一——入门书中罕见
- "会议室讨论 vs 排队打卡"的 Transformer vs RNN 类比生动
- "多个审稿人读句子"的多头注意力类比有效
- Encoder/Decoder/Encoder-Decoder 对比表格清晰
- 已补齐 Pre-Norm、RMSNorm、SwiGLU、GQA/MQA、FlashAttention 与 MoE，并明确区分架构和执行算法

## 改进建议

### P2 — 补充 KV Cache 解释
KV Cache 在第14章被引用，建议在本章先建立直觉，并在第14章补充部署成本：
- KV Cache 的直觉（不需要重新计算之前 token 的 K/V）
- 内存消耗估算公式
- 为什么推理时需要它

### P2 — FFN 部分过于简略
当前只提到"768→3072→768"维度变化，但没解释：
- 为什么需要这种瓶颈-扩展-瓶颈结构
- FFN 常用什么激活函数（GELU）
- FFN 层的作用（记忆/知识存储 vs attention 的关系建模）

### P2 — 缺少 Transformer 架构全图
本章缺少一个哪怕是 text-based 的架构图。建议用 ASCII 或流程图展示：
```
Input → Token Embedding + Position Encoding
  → [Multi-Head Attention → Add&Norm → FFN → Add&Norm] × N
  → Output
```

### P3 — 补充 "Attention Is All You Need" 的历史背景
没有提及原始论文和2017年的机器翻译背景。对一本"基础知识"书来说，这个历史锚点很重要。

### P3 — Tokenization 方法缺失
（见第7章 review.md — 这是跨章节问题，建议在第7章或本章补充）

### P3 — Encoder-Decoder 为何被 Decoder-Only 取代
列出了 T5 和 BART 但没解释为什么现代大模型几乎都是 decoder-only。建议加一段解释训练目标统一性和工程优势。

### P3 — 与第9章的衔接语调整
第8章末说"下一章将讨论 decoder-only Transformer 如何利用 next-token prediction 产生对话和生成能力"，但第9章已经全面覆盖了 next-token prediction。建议调整措辞，避免读者感觉重复。
