# Transformer 架构

## 本章目标

- 采用“实际问题—既有方法的难点—技术机制—适用边界”的叙事顺序，避免核心概念直接从定义起笔。
- 理解 Transformer 解决了什么问题。
- 掌握 token、位置编码、注意力、残差、LayerNorm、FFN 等核心组件。
- 建立从输入序列到上下文表示的完整数据流。

## 建议结构

1. Transformer 出现前的问题
   - RNN 的顺序计算瓶颈。
   - 长距离依赖难处理。
   - CNN 处理序列的局限。
   - Transformer 为什么更适合 GPU 并行。
   - 2017 年 Attention Is All You Need 的历史背景。
2. Token 与位置
   - 分词和 token id。
   - embedding lookup。
   - 位置编码为什么必要。
   - RoPE 等位置编码如何帮助长上下文。
3. Self-Attention
   - Query、Key、Value。
   - 注意力分数和 softmax。
   - 一个 token 如何关注其他 token。
   - 用“猫 追 狗”的简化数值例子理解 attention。
4. Multi-Head Attention
   - 多个头学习不同关系。
   - 拼接和线性变换。
   - 表达能力与计算成本。
   - 为什么 attention 成本和序列长度平方相关。
5. Transformer Block
   - Attention。
   - 残差连接。
   - LayerNorm。
   - Feed Forward Network。
   - Transformer 主干数据流图。
   - 一个 block 中 attention、残差、LayerNorm、FFN 的数据流。
   - FFN 作为“消化资料”的非线性加工层。
   - KV Cache 的架构直觉。
6. 现代 Transformer Block
   - Pre-Norm 与 Post-Norm 的数据流差异。
   - RMSNorm 与 LayerNorm 的区别。
   - SwiGLU 门控 FFN。
   - MHA、MQA 与 GQA 对 KV Cache 的影响。
   - FlashAttention 是精确 attention 的 I/O 优化算法。
   - MoE 路由、稀疏激活和通信代价。
7. Encoder、Decoder 与 Causal Mask
   - BERT 类 encoder。
   - GPT 类 decoder。
   - T5、BART 类 encoder-decoder。
   - 因果掩码如何避免看到未来 token。
8. 为什么 Transformer 能产生强大的上下文能力
   - 多层 attention 逐步交换信息。
   - 代码、问答、翻译中的上下文建模。
   - Transformer 仍然依赖数据、训练目标和推理策略。

## 实践任务

- 画出一个 Transformer block。
- 用一句话解释 Q、K、V。
- 说明 GPT 为什么需要 causal mask。
- 从模型配置中识别 RMSNorm、SwiGLU、RoPE、GQA 和 MoE。
- 比较 MHA、GQA、MQA 的 KV Cache 相对大小。

## 本章产出

读者应能读懂 Transformer 架构图，并知道每个模块在序列建模中的作用。
