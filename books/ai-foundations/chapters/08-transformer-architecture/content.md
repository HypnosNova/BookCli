# Transformer 架构

> **更新时间**：2026-07-29
>
> **事实审校**：核心公式与现代组件已按原始论文复核；具体模型采用的组件组合以其技术报告为准。

Transformer 是现代大语言模型的核心架构。核心思想是 self-attention：序列中的每个 token 可以根据需要关注其他 token，从而构建上下文相关的表示。

## Transformer 出现前的问题

在 Transformer 之前，RNN 常用于序列建模。RNN 按顺序处理 token，把历史信息压进隐藏状态。这符合序列直觉，但并行困难，长距离依赖也容易丢失。

CNN 也能处理序列，但主要靠局部窗口捕获信息，想建模远距离关系得堆很多层。

Transformer 用 attention 直接连接序列中任意位置。这样模型可以更容易捕捉长距离依赖，同时训练时也更适合并行计算。

Transformer 架构由 2017 年的论文 Attention Is All You Need 系统提出，最初主要面向机器翻译任务。当时的关键突破不是“模型更大”，而是用 attention 取代 RNN 的串行主干，让序列中任意位置可以直接交互，并显著提升并行训练效率。后来大语言模型沿用了这个核心结构，只是训练目标、数据规模和模型规模继续扩大。

例如句子“那本放在书架最上层、封面已经褪色的书，是我小时候最喜欢的故事集”。“书”和后面的“故事集”距离较远，RNN 需要一步步传递信息，容易衰减；attention 可以让“故事集”直接关注前面的“书”和相关修饰语。

可以把 RNN 想成排队打卡。第 100 个 token 必须等前 99 个 token 都处理完，才能轮到自己。序列越长，等待越久。Transformer 更像会议室讨论：所有 token 同时摊在桌面上，每个位置都可以直接查看其他位置的信息。这个结构更适合 GPU，因为 GPU 擅长一次性做大量矩阵计算，而不是长链条的串行等待。

这并不意味着 Transformer 没有代价。它让任意 token 之间都能交互，因此需要计算很多 token 对之间的关系。序列越长，attention 的计算和显存成本增长越快。后面的推理章节会继续讨论长上下文为什么昂贵，以及 KV Cache 如何缓解生成阶段的重复计算。

## Token 与位置

句子“猫追狗”和“狗追猫”包含同样三个词，含义却相反。模型既要把每个文本片段变成数字，也要知道它位于哪里；否则 attention 只会看到一袋无序对象。

文本进入模型前会被分词，转换成 token id。模型通过 embedding 表把 token id 映射为向量。

但 attention 本身不天然知道顺序。如果只给模型一组 token 向量，它无法区分“猫追狗”和“狗追猫”的位置关系。因此需要位置编码，把位置信息加入输入表示。

位置编码可以是固定函数，也可以是可学习参数。现代模型中还出现了 RoPE 等更适合长上下文的方案。

可以用数组理解位置。如果只有 token 值而没有索引，`["猫", "追", "狗"]` 和 `["狗", "追", "猫"]` 的词集合相同，但意思相反。位置编码就是把“第 0 个、第 1 个、第 2 个”这类顺序信息注入模型。

位置编码的重要性在于：attention 本身更像“看一堆对象之间谁和谁相关”，而不是天然按顺序阅读。如果不提供位置信息，模型看到的只是 token 集合，无法知道“不是我打了他”和“不是他打了我”的区别。位置编码给每个 token 加上座位号，让模型同时知道“这个词是什么”和“这个词在哪里”。

RoPE 这类位置编码会把位置信息以旋转方式融合到向量中。它的好处是更适合表达相对位置关系，例如两个 token 相隔多远。对于长上下文模型来说，位置表示非常关键，因为模型不仅要知道词的顺序，还要在很长文本里保持相对距离感。

## Self-Attention

长句中的代词、代码里的变量和文档末尾的问题，都需要从许多位置中临时挑出最相关的信息。固定窗口看不远，把全部历史压进一个状态又容易丢失细节。模型需要一种能为当前 token 动态选择上下文的机制。

Self-attention 的核心是 Query、Key、Value。每个 token 会生成自己的 Q、K、V 向量。一个 token 的 Query 会和所有 token 的 Key 计算相似度，得到注意力分数。分数经过 softmax 后，作为权重加权求和所有 Value。

直觉上，Query 表示“我想找什么”，Key 表示“我有什么信息可被匹配”，Value 表示“如果被关注，我提供什么内容”。

例如句子“它放在桌子上，因为杯子太满了”中，“它”需要根据上下文判断指代对象。Attention 允许模型在相关 token 之间建立联系。

再看代码补全：`function getUserName(user) { return user.` 之后，当前 token 需要关注 `user` 这个变量和函数名中的 `Name`，才能更倾向于补全 `name`。attention 的价值就在于动态选择“此刻最相关的上下文”。

用一个极简数值例子看 attention 如何工作。假设句子是：

```text
猫 追 狗
```

为了简化，每个 token 的 Q、K、V 都用二维向量表示。现在我们只看“追”这个 token 如何决定关注谁：

```text
Q(追) = [1.0, 1.0]

K(猫) = [0.9, 0.2]
K(追) = [0.5, 0.5]
K(狗) = [0.2, 0.9]

V(猫) = [主体信息]
V(追) = [动作信息]
V(狗) = [客体信息]
```

先用 `Q(追)` 分别和每个 Key 做点积，得到注意力分数：

```text
追 对 猫: 1.0*0.9 + 1.0*0.2 = 1.1
追 对 追: 1.0*0.5 + 1.0*0.5 = 1.0
追 对 狗: 1.0*0.2 + 1.0*0.9 = 1.1
```

这些分数经过 softmax 后，可能变成类似：

```text
猫: 0.35
追: 0.30
狗: 0.35
```

最后，“追”的新表示就是三个 Value 的加权和：

```text
新表示(追) = 0.35*V(猫) + 0.30*V(追) + 0.35*V(狗)
```

这意味着“追”这个位置的新表示不仅包含动作本身，也吸收了主语“猫”和宾语“狗”的信息。真实模型中的向量维度更高，注意力头更多，计算也更复杂，但核心逻辑就是：先计算相关性，再按相关性汇总信息。

这种机制和传统固定窗口不同。模型不是永远只看前后几个词，而是根据当前 token 的需要动态决定关注谁。处理代词时可能关注前面的名词，处理代码变量时可能关注变量定义，处理长文档问答时可能关注远处的关键句。

## Multi-Head Attention

同一个 token 可能同时参与主谓关系、指代关系和时间关系。若只有一张注意力权重图，这些不同信号会被压进同一个视角；模型需要并行观察多种关系。

单个 attention 头只能从一种表示子空间学习关系。Multi-head attention 使用多个头并行学习不同关系。有的头可能关注语法结构，有的头关注实体指代，有的头关注局部搭配。

多个头的输出会拼接，再经过线性变换。这提高了模型表达能力，但也增加了计算成本。注意力计算通常与序列长度平方相关，因此长上下文推理会很昂贵。

“序列长度平方”值得单独理解。假设输入有 1000 个 token，每个 token 都要和其他 token 计算一次相关性，大约是 1000 x 1000 = 100 万个 token 对。输入变成 2000 个 token 时，计算不是翻倍，而是 2000 x 2000 = 400 万，约 4 倍。输入变成 32000 个 token 时，attention 关系数量会非常庞大。

这就是长上下文能力昂贵的原因之一。上下文窗口越长，模型能读的内容越多，但 attention 计算、KV Cache 显存和推理延迟也会增加。实际系统需要在“给模型更多上下文”和“保持成本可控”之间取舍。

可以把多头注意力想成多个审稿人同时读一句话。一个人关注主谓关系，一个人关注代词指代，一个人关注时间顺序，一个人关注代码变量名。最后把这些视角合并，得到更完整的理解。

## Transformer Block

只做 attention 只能让 token 交换信息，还不足以完成复杂的非线性加工；堆很多层时，梯度和数值分布也容易不稳定。Transformer 需要把信息混合、逐位置变换和稳定训练组合成可重复堆叠的单元。

一个典型 Transformer block 包含 attention、残差连接、LayerNorm 和 Feed Forward Network。

残差连接让输入可以绕过子层直接传到后面，缓解深层网络训练困难。LayerNorm 稳定数值分布，使训练更容易。FFN 对每个位置独立做非线性变换，增强表示能力。

多个 block 堆叠后，模型逐层重写 token 表示。浅层可能关注局部和词形信息，深层更可能形成任务相关和语义相关表示。

例如输入“把下面的 JSON 转成 TypeScript 类型”。浅层先识别标点、字段名和字符串，后续层逐渐形成“这是结构化转换任务”的表示，再生成对应类型定义。

从整体上看，一个 decoder-only Transformer 的主干可以简化成这样：

```text
文本
  -> tokenizer 切成 token id
  -> Token Embedding + Position Encoding
  -> [Multi-Head Attention -> Add/Norm -> FFN -> Add/Norm] x N
  -> 输出层得到下一个 token 的概率分布
```

不同实现会把 LayerNorm 放在子层之前或之后，也会使用不同的位置编码和激活函数，但主线基本一致：先把离散 token 变成向量，再通过多层 block 让每个位置吸收上下文，最后把隐藏表示转换成词表上的概率。

一个 Transformer block 的数据流可以拆成这样：

```text
输入 token 表示
  -> Multi-Head Attention：让每个位置收集上下文信息
  -> 残差连接：把 attention 输出和原输入相加
  -> LayerNorm：稳定数值分布
  -> FFN：对每个位置做非线性加工
  -> 残差连接：把 FFN 输出和进入 FFN 前的表示相加
  -> LayerNorm：再次稳定数值
  -> 输出给下一个 block
```

不同模型会使用 Pre-LN 或 Post-LN 等细节差异，但核心思想相似：attention 负责信息交换，FFN 负责局部加工，残差连接保证原始信息不容易丢失，LayerNorm 让训练更稳定。

FFN，也就是前馈网络，通常由两层全连接组成：先升维，再降维。例如把 768 维向量升到 3072 维，经过 GELU 激活后再降回 768 维。升维让模型在更大的中间空间里组合特征，非线性激活让这些组合不只是线性变换，降维再把结果压回原来的隐藏维度。

可以把 attention 理解为“查资料”：当前 token 从上下文里取回相关信息；把 FFN 理解为“消化资料”：每个位置独立地对收集到的信息做进一步加工。attention 更关注 token 之间的关系，FFN 更像每个 token 自己内部的思考层。很多研究也会把 FFN 看成存储和重组知识模式的重要位置，虽然这种说法只是帮助理解，不能简单等同于数据库。

残差连接也很重要。深层网络如果每层都完全重写输入，信息和梯度都容易在层间丢失。残差连接给信息留了一条旁路，让模型在需要时可以保留原始表示。它有点像编辑文档时保留原稿，再在旁边叠加修改，而不是每一步都把原稿彻底覆盖。

很多初学者会问：网络有那么多层，怎么知道哪几层算一个适合残差连接的模块？关键不在层数，而在功能边界。一个模块通常满足两个条件：第一，它们合起来完成一个清晰任务；第二，模块输入和输出仍然是同一种表示。例如 attention 子层的任务是让每个 token 收集上下文信息，输入是 token hidden states，输出仍然是 token hidden states，所以适合做残差连接。FFN 子层的任务是对每个位置做非线性加工，输入和输出也都是 hidden states，所以也适合做残差连接。

因此 Transformer 里常见的残差边界是：

```text
x = x + Attention(LayerNorm(x))
x = x + FFN(LayerNorm(x))
```

这里的 Attention 和 FFN 各自就是一个有明确功能的模块。FFN 内部虽然常常先从 768 维升到 3072 维，再降回 768 维，但模块最终输出回到原来的 hidden size，所以可以和输入相加。中间升维只是模块内部计算，不是残差连接的边界。

在卷积网络中，残差块可能由几层卷积、归一化和激活函数组成：

```text
x -> Conv -> BN -> ReLU -> Conv -> BN -> + -> 输出
|                                      |
└──────────────────────────────────────┘
```

判断是否适合加残差连接，可以用一个简单标准：这几层是不是在“更新同一份表示”，而不是把表示彻底换成另一种东西。`Linear -> GELU -> Linear`、`Attention -> 输出投影`、`Conv -> BN -> ReLU -> Conv` 都常常可以看成模块；而“图像特征 -> 分类 logits”、“hidden states -> 词表概率”这类语义和形状都变化很大的步骤，通常不直接做这种残差相加。

KV Cache 可以从这个结构中自然理解。生成第 100 个 token 时，模型需要让新 token 关注前面 99 个 token。前面 token 在每层 attention 中已经计算过 Key 和 Value，如果每一步都重新计算，会浪费大量算力。KV Cache 就是把历史 token 的 Key 和 Value 保存下来，生成后续 token 时直接复用。它能减少重复计算，但会占用显存；第 14 章会从推理部署角度详细讨论它的成本。

## 现代 Transformer Block 的常见组件

经典 Transformer 能工作，但模型加深、上下文变长、并发增大后，会逐渐暴露训练不稳定、FFN 表达效率、KV Cache 体积、显存读写和计算成本等瓶颈。现代组件不是一组需要背诵的新名词，而是分别针对这些瓶颈做出的工程改造。

2017 年的经典结构仍是骨架，但现代大语言模型很少原样照搬。它们通常会调整归一化位置、FFN 激活、位置表示和注意力头组织，并使用更贴近硬件的执行算法。一个常见的 dense decoder block 可以简化为：

```text
h = h + Attention(RMSNorm(h), RoPE, GQA)
h = h + SwiGLU(RMSNorm(h))
```

这不是所有模型的统一配方，而是一张阅读架构配置时很有用的地图。

### Pre-Norm 与 RMSNorm

经典 Transformer 常写成 Post-Norm：先执行子层并做残差相加，再归一化。

```text
Post-Norm: y = Norm(x + Sublayer(x))
Pre-Norm:  y = x + Sublayer(Norm(x))
```

Pre-Norm 把归一化放到 attention 或 FFN 之前，让残差主干保持一条更直接的信息和梯度通路，深层训练通常更稳定。不过归一化位置仍在演进，不同模型也可能使用 Post-Norm、Pre-Norm 或其他变体，不能只凭名称判断质量。

RMSNorm 则回答另一个问题：归一化具体怎么算。LayerNorm 会减去均值并按标准差缩放；RMSNorm 不做减均值，只按均方根调整尺度，因此计算更简单。要注意，**Pre-Norm 是归一化放在哪里，RMSNorm 是使用哪种归一化函数**，两者不是同一维度的选项。

### 从 GELU FFN 到 SwiGLU

经典 FFN 常用 `Linear → GELU → Linear`。SwiGLU 增加一条门控分支，让一个投影决定哪些特征应该通过：

```text
gate = Swish(xW_gate)
value = xW_up
output = (gate ⊙ value)W_down
```

其中 `⊙` 表示逐元素相乘。可以把 `value` 看成候选信息，把 `gate` 看成按输入动态调节的阀门。SwiGLU 往往会配合不同的中间维度，因此不能只数线性层就比较两个模型的参数量和计算量。

### MHA、MQA 与 GQA

标准 Multi-Head Attention（MHA）让每个 Query 头都有自己的 Key 和 Value 头，表达能力强，但自回归生成时每层都要为所有 KV 头保存历史缓存。

Multi-Query Attention（MQA）让所有 Query 头共享一组 K/V，显著缩小 KV Cache 和读取带宽，但共享过强可能影响质量。Grouped-Query Attention（GQA）位于两者之间：多个 Query 头组成一组，每组共享一个 K/V 头。

```text
MHA:  32 个 Q 头 → 32 个 K/V 头
GQA:  32 个 Q 头 →  8 个 K/V 头
MQA:  32 个 Q 头 →  1 个 K/V 头
```

在层数、head dimension、序列长度和精度相同的简化条件下，8 个 KV 头的 GQA，其 attention K/V 缓存大约是 32 个 KV 头 MHA 的四分之一。实际显存还包含模型权重、激活、临时张量和分配开销，不能把这个比例直接当成整张 GPU 显存的比例。

### FlashAttention 是执行算法，不是新注意力语义

普通实现可能把完整 attention score 矩阵写入 GPU 高带宽显存，再多次读回。FlashAttention 通过分块，把局部 Q/K/V 放进更快的片上存储，边计算边完成稳定 softmax，减少显存层级之间的读写。

它计算的仍是数学意义上的精确 attention，不是把远处 token 近似删除。它也没有把全连接 attention 的理论计算量从平方级自动变成线性级；主要改进来自更少的中间矩阵存储和 I/O。模型结构、attention 语义与 kernel 实现要分开理解。

### MoE：只激活部分 FFN 专家

Mixture-of-Experts（MoE）通常把某些 dense FFN 替换成多个专家网络。路由器为每个 token 选择少量专家，例如 top-1 或 top-2，再合并专家输出。

```text
token → router → 专家 2、专家 7 → 合并输出
```

MoE 可以增加总参数量，而不让每个 token 激活全部参数；但它不是“免费扩容”。路由负载不均会让部分专家拥塞，跨设备发送 token 会增加通信，训练还要处理专家容量、负载均衡和稳定性。比较 MoE 模型时，应同时看总参数、每 token 激活参数、专家数量、路由策略和部署拓扑。

### 把组件放回同一张图

| 组件 | 主要解决什么 | 不应误解为什么 |
|---|---|---|
| Pre-Norm | 深层训练中的梯度与稳定性 | 一种新的归一化公式 |
| RMSNorm | 更简洁的尺度归一化 | 位置编码或激活函数 |
| SwiGLU | 给 FFN 增加输入相关门控 | attention 的替代品 |
| RoPE | 向 Q/K 融合位置信息 | 自动保证任意长度外推 |
| GQA/MQA | 减少 KV 头、缓存和读取带宽 | 让 attention 变成线性复杂度 |
| FlashAttention | 减少 attention 的显存 I/O 和中间存储 | 一种近似 attention 模型 |
| MoE | 稀疏激活部分 FFN 专家 | 所有参数每个 token 都参与计算 |

## Encoder、Decoder 与 Causal Mask

阅读分类时，每个 token 可以利用整段输入；逐 token 生成时，如果训练阶段看见未来答案，就会作弊。不同任务需要不同的信息可见范围，因此形成 encoder、decoder 与 causal mask 等结构。

Encoder 架构适合理解任务，例如分类、检索和语义表示。BERT 是典型 encoder 模型，它可以同时看到整个输入序列。

Decoder 架构适合生成任务。GPT 类模型使用 decoder-only Transformer，并通过 causal mask 限制每个 token 只能关注自己和之前的 token，不能看到未来 token。这样训练目标与生成过程一致：一步一步预测下一个 token。

还存在 Encoder-Decoder 架构，例如 T5、BART 等。Encoder 先完整读取输入，Decoder 再基于 Encoder 的结果逐步生成输出。这类结构适合翻译、摘要等“读一段输入，再生成一段输出”的任务。

三种结构可以这样理解：

| 架构 | 是否看完整输入 | 典型任务 | 代表模型 |
|---|---|---|---|
| Encoder-only | 可以双向看完整输入 | 分类、检索、语义匹配 | BERT |
| Decoder-only | 只能看当前位置之前 | 对话、续写、代码生成 | GPT 系列 |
| Encoder-Decoder | Encoder 看完整输入，Decoder 逐步生成 | 翻译、摘要、文本转换 | T5、BART |

许多现代大语言模型采用 decoder-only 架构。原因之一是它和“预测下一个 token”的训练目标天然一致，也容易扩展到开放式生成、对话、代码和工具调用等任务。模型只要不断重复“看已有上下文，预测下一个 token”，就能完成很多不同形式的生成任务。

Causal mask 是生成模型的关键约束。训练时，如果模型在预测第 5 个 token 时能偷看第 6 个 token，训练就会变成作弊。causal mask 会遮住未来位置，让每个 token 只能利用过去信息。这样训练过程和实际生成过程一致：生成答案时，模型也只能看到已经生成出来的内容。

## 为什么 Transformer 能产生强大的上下文能力

Transformer 的一个核心优势，是每一层都能让 token 之间重新交换信息。第一层里，“它”可能先关注附近名词；第二层里，它已经带着这些信息继续和更远位置交互；多层堆叠后，模型就能逐步构建复杂上下文表示。

在代码场景中，模型可以把变量定义、函数名、类型注释和当前补全位置联系起来。在问答场景中，模型可以把问题中的关键词和上下文中的证据句联系起来。在翻译场景中，模型可以把源语言词组和目标语言表达对齐。

但 attention 不是完美理解。它只是提供了信息交互机制，模型是否真的学到可靠能力，仍然取决于训练数据、模型规模、训练目标、上下文质量和推理策略。因此理解 Transformer 时，既要看到它的强大，也要记住它仍然是统计学习系统的一部分。

## 动手试试

1. **Self-Attention 手算**：给定三个 token 的 Q/K/V 矩阵（每个 2 维），手算注意力分数（softmax(QK^T)）和输出（softmax(QK^T)V），观察哪个 token 对哪个 token 关注最多。
2. **KV Cache 大小估算**：一个 7B 模型（32 层、32 头、每头 128 维），FP16 精度，上下文 4096 tokens 时，KV Cache 占多少 GB 显存？（提示：参数量 = 2 × 层数 × 头数 × 头维 × 序列长度 × 2字节）
3. **思考题**：如果 Transformer 没有位置编码，"猫追狗"和"狗追猫"的 attention 输出会完全相同吗？为什么这对语言理解是问题？
4. **KV 头实验**：假设模型有 32 个 Query 头，分别计算 MHA（32 个 KV 头）、GQA（8 个 KV 头）和 MQA（1 个 KV 头）在相同层数、序列长度和精度下的 KV Cache 相对大小。
5. **读模型配置**：找一份公开模型配置，标出 norm、activation、position embedding、attention heads、KV heads 和是否使用 MoE。区分哪些是模型架构，哪些是运行时 kernel。

## 理解检查

1. Self-attention 中，Query、Key、Value 的直觉关系是什么？
   - A. Query 表示要找什么，Key 表示可匹配的信息，Value 表示被关注后提供的内容。
   - B. Query 是输出答案，Key 是模型参数，Value 是训练标签。
   - C. Query 负责分词，Key 负责位置编码，Value 负责量化。
   - D. 三者只是同一个向量的三个名字，没有功能区别。

2. 为什么长上下文 Transformer 的计算成本会上升很快？
   - A. 因为 attention 需要计算许多 token 对之间的关系，成本通常随序列长度平方增长。
   - B. 因为 token 越多，模型参数会永久增加。
   - C. 因为 softmax 只能处理 100 个 token。
   - D. 因为位置编码会删除旧 token。

3. 关于现代 Transformer 组件，哪项说法正确？
   - A. FlashAttention 通过删除低分 token，把所有 attention 计算变成线性复杂度。
   - B. GQA 让一组 Query 头共享 K/V 头，可以减少自回归生成的 KV Cache。
   - C. RMSNorm 是一种位置编码，作用和 RoPE 相同。
   - D. SwiGLU 会替代 tokenizer 完成分词。

## 小结

Transformer 的核心是 attention，它让模型根据上下文动态整合信息。Token embedding 提供输入表示，位置编码提供顺序，multi-head attention 建模多种关系，FFN 对每个位置做进一步加工，残差连接和归一化支撑深层训练。现代模型常进一步组合 Pre-Norm、RMSNorm、SwiGLU、RoPE 和 GQA，并用 FlashAttention 优化执行；部分模型还用 MoE 扩展稀疏参数容量。

理解这些模块后，大语言模型的工作方式就不再是黑箱。下一章会从训练目标、采样、上下文窗口和 prompt 的角度继续解释：这些 Transformer 模块如何被组织成可交互的大语言模型。

## 参考资料

- [On Layer Normalization in the Transformer Architecture](https://arxiv.org/abs/2002.04745)
- [Root Mean Square Layer Normalization](https://arxiv.org/abs/1910.07467)
- [GLU Variants Improve Transformer](https://arxiv.org/abs/2002.05202)
- [RoFormer: Enhanced Transformer with Rotary Position Embedding](https://arxiv.org/abs/2104.09864)
- [GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints](https://arxiv.org/abs/2305.13245)
- [FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness](https://arxiv.org/abs/2205.14135)
- [Switch Transformers: Scaling to Trillion Parameter Models with Simple and Efficient Sparsity](https://arxiv.org/abs/2101.03961)
