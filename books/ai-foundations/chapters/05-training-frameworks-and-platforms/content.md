# 训练框架与工程平台

> **更新时间**：2026-07-13
>
> **事实审校**：框架定位与工程概念已按官方文档和原始论文复核；API、版本与生态状态以本次更新时间为边界。

上一章用一个很小的例子解释了训练循环：前向计算、损失函数、反向传播、参数更新。如果只训练一个神经元，手写这些步骤并不困难；但一旦模型变成数十层网络、数据来自多个文件、训练要跑在多张 GPU 上，还要保存检查点、记录指标、恢复失败任务、比较不同实验，手写训练系统就会迅速失控。

训练框架做的事情是把重复且容易出错的工作沉淀成稳定的工程能力。理解训练原理仍然需要你自己去做，框架帮你把精力留给模型结构、数据、目标函数和实验设计。

如果你刚开始学习，不需要一次记住本章所有框架名。最实用的路线是先理解 PyTorch 或 Keras 这类核心框架，再学习 Hugging Face 生态如何复用预训练模型。DeepSpeed、FSDP、Megatron、Ray、Kubeflow、TFX、MLflow 这些工具可以先知道它们解决什么问题，等真的遇到大模型训练、集群调度、实验追踪和企业上线时再深入。

一个新手路径可以很简单：

1. 用 PyTorch 写一个最小训练循环，对应上一章的前向、loss、反向传播和优化器。
2. 用 Hugging Face 加载一个预训练模型，先做推理，再尝试小规模微调。
3. 当单卡显存不够或训练任务需要多人协作时，再学习 FSDP、DeepSpeed、MLflow、Ray 或 Kubeflow。

这样读本章时就不会被工具名淹没：先抓住“核心框架”和“预训练模型生态”，其余层级按问题需要逐步展开。

## 训练框架到底帮我们做什么

一个成熟训练框架通常会处理几类问题。

第一类是张量计算。模型中的输入、权重、激活值、梯度都表示为多维数组，也就是张量。框架需要提供矩阵乘法、卷积、归一化、采样、拼接、索引、广播等基础算子，并把这些算子调度到 CPU、GPU、TPU 或其他加速器上执行。

第二类是自动微分。上一章的手写例子里，我们自己推导了梯度公式；真实神经网络包含大量复合运算，手写每个参数的偏导数既低效也不可靠。自动微分系统会在前向计算时记录计算关系，然后在反向传播时按链式法则自动计算梯度。

第三类是模型抽象。开发者通常不希望每次都从矩阵乘法开始写起，所以框架会提供 `Linear`、`Conv2D`、`LayerNorm`、`Embedding`、`TransformerBlock` 等模块。模型由模块组合而成，参数也由模块统一管理。

第四类是训练循环。训练循环包含数据加载、前向计算、损失计算、反向传播、优化器更新、学习率调度、梯度裁剪、混合精度、验证、日志、检查点保存等步骤。底层框架会提供基础能力，高层框架则会把这些步骤组织成更完整的训练模板。

第五类是分布式与生产能力。当模型或数据变大，训练可能需要多卡、多机、容错调度、分片检查点、资源队列、实验追踪、模型注册和上线流程。此时只靠一个深度学习框架还不够，还需要分布式训练库和 MLOps 平台。

“训练框架”这个词在不同语境里可能指向不同层级。讨论框架对比时，先把层级分清。

## 四层架构：框架、封装、优化库、平台

现代训练系统可以粗略分成四层。

最底层是核心深度学习框架，例如 PyTorch、TensorFlow、JAX。它们负责张量、自动微分、模型定义、优化器、设备管理和基础分布式通信。这一层决定了模型代码的表达方式。

第二层是高层训练封装，例如 Keras、PyTorch Lightning、Hugging Face Trainer、Accelerate。它们通常不重新实现张量和自动微分，而是在底层框架之上封装训练循环、配置、回调、日志、检查点和多设备启动，解决的诉求是”把常见训练任务写得更标准、更少样板代码”。

第三层是大模型分布式优化库，例如 DeepSpeed、Megatron-LM、PyTorch FSDP。它们关注显存、通信和并行策略，典型能力包括 ZeRO、参数分片、优化器状态分片、激活检查点、张量并行、流水线并行和分布式检查点。它们通常和 PyTorch 或 Hugging Face 生态一起使用。

第四层是企业级训练平台和 MLOps 平台，例如 Kubeflow、Ray Train、TFX、MLflow。它们关心的不是一次训练代码怎么写，而是训练任务如何被调度、复现、审计、监控、比较、注册和部署——解决的是组织级工程问题。

这四层互不排斥。一个大模型微调项目可能用 PyTorch 写模型，用 Hugging Face Trainer 管训练循环，用 DeepSpeed 做显存优化，用 Ray 或 Kubernetes 调度集群，用 MLflow 记录实验。工程选型的重点不是”选一个框架包打天下”，而是明确每一层需要什么能力。

也可以用“你现在需要关心吗”来理解四层：

| 层级 | 代表工具 | 初学者需要关心吗？ |
|---|---|---|
| 核心框架层 | PyTorch、TensorFlow、JAX | 需要，至少掌握一个 |
| 高层封装层 | Hugging Face、Lightning、Keras Trainer | 很快会用到，尤其是微调预训练模型 |
| 分布式优化层 | DeepSpeed、FSDP、Megatron | 模型太大、单卡放不下时再深入 |
| 平台层 | Ray、Kubeflow、TFX、MLflow | 团队生产、调度、追踪和治理时再深入 |

这个表的重点是降低学习焦虑。初学者不需要同时学完四层，但要知道每一层解决什么问题。

## PyTorch：灵活、直观、研究友好

PyTorch 的核心特点是动态图和接近普通 Python 的写法。你可以像写普通程序一样写条件分支、循环、打印调试和断点调试，前向计算执行时就会动态构建计算图，反向传播时再根据这次实际执行的路径计算梯度。

这种模式对研究和自定义模型非常友好。新模型结构还不稳定时，开发者经常需要频繁修改模块、观察中间张量、替换损失函数、临时加入调试逻辑。PyTorch 的灵活性让这些操作更直接。

从架构上看，PyTorch 可以理解成几块核心能力：

- `torch.Tensor` 表示张量和设备上的数据。
- `torch.autograd` 负责自动微分。
- `torch.nn` 提供模型模块和常见层。
- `torch.optim` 提供优化器。
- `torch.utils.data` 处理数据集和批次加载。
- `torch.distributed`、DDP、FSDP、张量并行和流水线并行处理分布式训练。
- `torch.compile` 通过编译优化提升部分模型的运行效率。

PyTorch 的优势是灵活、生态活跃、研究代码多、调试体验好。它的代价是工程规范需要团队自己建立：项目结构、配置管理、日志、检查点、实验记录、分布式启动方式，如果不加约束，很容易每个项目都有一套风格。

所以 PyTorch 常见于研究、原型验证、模型创新和大模型生态。生产环境也可以使用 PyTorch，但通常会搭配 Lightning、Hugging Face、TorchServe、ONNX、Triton、Ray、Kubeflow 或内部平台，把工程流程标准化。

## TensorFlow 与 Keras：完整链路和工程化

TensorFlow 的历史定位更偏完整机器学习系统。它不仅提供张量和自动微分，也长期强调图执行、部署格式、数据流水线、移动端和服务端推理生态。

Keras 则提供了更高层的建模和训练接口。使用 Keras 时，很多训练细节可以通过 `model.compile()`、`model.fit()`、callbacks、metrics 和 `tf.data` 管道来组织。对标准监督学习任务来说，Keras 能显著减少训练样板代码。

从架构上看，TensorFlow 生态通常包含：

- TensorFlow Core：张量计算、自动微分、图执行、设备调度。
- Keras：高层模型、层、训练 API。
- `tf.data`：高性能数据输入管道。
- Distribution Strategies：单机多卡、多机多卡训练策略。
- SavedModel：模型导出和服务化的重要格式。
- TensorFlow Serving、TensorFlow Lite、TensorFlow.js：不同部署目标。
- TFX：面向生产环境的端到端 ML pipeline。

TensorFlow/Keras 的优势是训练、导出、服务化、移动端和生产 pipeline 之间的链路相对完整。对于企业团队来说，这种完整链路有价值，因为模型不只是训练出来，还要进入验证、发布、监控和回滚流程。

它的代价是抽象更多，某些自定义研究场景下不如 PyTorch 直观。尤其当开发者需要频繁改变模型内部控制流、写非常规训练步骤或深度调试图执行行为时，学习成本会更明显。

## JAX：函数式、可组合变换和编译优化

JAX 的思路和 PyTorch、TensorFlow 都不完全一样。它更像是一个面向数值计算和机器学习的函数变换系统：你先写一个接近 NumPy 风格的纯函数，然后用 `grad` 求导，用 `jit` 编译，用 `vmap` 自动向量化，用 `pmap` 或更现代的分片机制做并行。

JAX 的架构重点在于”函数可以被系统变换”，而非”模型对象管理一切”。例如，同一个损失函数可以被 `grad` 转换成梯度函数，可以被 `jit` 编译，也可以和 `vmap` 组合成批处理版本。这种设计让 JAX 在科学计算、强化学习、生成模型研究和高性能训练中很有吸引力。

典型 JAX 项目通常还会搭配其他库：

- Flax、Haiku、Equinox：神经网络模块抽象。
- Optax：优化器和梯度变换。
- Orbax：检查点。
- XLA/OpenXLA：编译和加速执行。

JAX 的优势是函数式表达清晰、变换可组合、编译优化能力强，适合需要精细控制计算和并行策略的团队。它的代价是心智模型更陡：随机数、状态、可变参数、动态 shape、调试和分布式分片都需要按 JAX 的方式思考。初学者或普通业务团队用 JAX 往往不是最低成本选择。

如果你的目标是先理解深度学习训练和常见模型微调，可以先跳过 JAX。等你熟悉了 PyTorch 或 TensorFlow，开始关注高性能数值计算、研究型模型或复杂并行策略时，再回头学习 JAX 会更自然。

## Hugging Face 生态：把预训练模型训练产品化

Hugging Face 不是一个底层自动微分框架，它更多是围绕预训练模型形成的应用生态。Transformers 提供模型结构和预训练权重，Datasets 处理数据集，Tokenizers 提供高性能分词，Trainer 封装常见训练和评估循环，Accelerate 简化多设备和分布式启动，PEFT 支持 LoRA 等参数高效微调方式。

对于大多数开发者来说，Hugging Face 的价值在于把“从零搭模型”变成“基于已有模型做适配”。如果任务是文本分类、问答、摘要、翻译、多模态理解或大模型指令微调，直接从 Transformers 和 Trainer 开始通常比从原生 PyTorch 开始更高效。

它的架构可以看成 PyTorch 生态的应用层封装：

- 模型类负责加载预训练结构和权重。
- tokenizer 或 processor 负责把原始输入变成模型张量。
- dataset 和 data collator 负责样本组织和 padding。
- Trainer 负责训练、评估、日志、检查点和部分分布式能力。
- Accelerate 负责设备放置、混合精度、分布式进程和与 DeepSpeed/FSDP 的集成。
- Hub 负责模型、数据集和产物分发。

Hugging Face 的优势是开发速度快、预训练模型生态强、微调路径成熟。它的限制同样来自封装：当模型结构、训练目标或数据流非常特殊时，高层封装可能变成约束。此时常见做法是保留 Transformers 的模型和 tokenizer，但改用自定义 PyTorch 训练循环或 Accelerate 来获得更细粒度控制。

一个最小推理例子大致是：

```py
from transformers import AutoModelForCausalLM, AutoTokenizer

model_name = "Qwen/Qwen2.5-0.5B-Instruct"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(model_name)

inputs = tokenizer("解释一下什么是 embedding", return_tensors="pt")
outputs = model.generate(**inputs, max_new_tokens=80)
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
```

真实项目还要考虑设备放置、量化、流式输出、批处理和安全过滤，但这段代码展示了 Hugging Face 的关键卖点：用统一接口加载 tokenizer、模型和权重。

## Lightning、Keras Trainer 与高层训练封装

高层训练封装的核心目标是减少样板代码，并让团队训练流程更一致。以 PyTorch Lightning 为例，它把模型定义、训练步骤、验证步骤、优化器配置、日志、检查点、分布式策略等组织成固定结构。开发者不必每个项目都手写完整训练循环。

这类框架通常会提供：

- 统一的训练、验证、测试入口。
- 回调系统，例如早停、保存最佳模型、学习率监控。
- 日志和实验追踪集成。
- 混合精度和多卡训练开关。
- 检查点保存与恢复。
- 更少的分布式样板代码。

它们适合团队协作和常规模型训练，因为代码结构更规范，工程习惯更容易统一。但抽象也会带来边界：当训练过程非常特殊，例如每个 batch 里要动态采样多个环境、跨模型交替优化、手写复杂通信逻辑时，开发者可能需要绕开框架默认循环。

高层封装的选型原则是：如果你的训练流程大体标准，它能省很多时间；如果你的训练流程本身就是研究对象，过早使用高层封装可能会妨碍理解和调试。

## DeepSpeed、FSDP 与 Megatron：大模型训练优化

大模型训练的主要瓶颈在显存、通信和吞吐，不在”会不会反向传播”。

一个参数量很大的模型，不只权重占显存，梯度、优化器状态、激活值也占显存。以 Adam 为例，优化器会为参数维护额外状态；混合精度训练中还可能保留主权重。模型越大，单卡越放不下，多卡训练也会遇到通信开销。

DeepSpeed、FSDP、Megatron-LM 这类工具解决的是系统优化问题。

FSDP 的核心思想是把模型参数、梯度和优化器状态在多个进程之间分片。每张卡只持有一部分状态，需要计算某层时再临时聚合必要参数，计算后释放或重新分片。这样可以训练比单卡显存更大的模型。

可以用一个简单类比理解 FSDP。假设一个模型相关状态需要 100GB 显存，但一张 GPU 只有 40GB，单卡肯定放不下。FSDP 会把模型状态切给多张 GPU，例如 3 张卡各自保存约三分之一。需要计算某一层时，再临时从其他卡收集缺失部分；计算结束后，再把状态重新分片。这样每张卡不必长期保存完整模型，显存压力就会下降。

DeepSpeed 的代表能力是 ZeRO 系列优化。ZeRO 会把优化器状态、梯度、参数按阶段进行分片，并结合 CPU/NVMe offload、通信优化、混合精度、激活检查点等技术降低显存压力。DeepSpeed 还常和 Hugging Face、Accelerate、Lightning 等上层工具集成。

Megatron-LM 更强调大规模 Transformer 的并行训练策略，包括张量并行、流水线并行和数据并行组合。张量并行把单层矩阵运算切到多张卡上，流水线并行把不同层分给不同设备，数据并行则复制模型处理不同 batch。

这些工具不是初学者训练小模型的首选。它们的价值出现在模型和数据已经大到普通单机训练无法承受时。使用它们时，开发者需要理解显存构成、通信拓扑、batch size、梯度累积、checkpoint 分片、恢复训练和吞吐监控，否则配置项很容易变成黑箱。

## Ray、Kubeflow、TFX、MLflow：企业生产与平台化

企业生产环境关心的不只是单次训练能不能跑通，而是整个训练过程是否可复现、可调度、可审计、可监控、可交接。

Ray Train 关注分布式训练任务的伸缩和调度。它可以把本来在单机上运行的训练代码扩展到集群，并支持 PyTorch、TensorFlow、Keras、Hugging Face、DeepSpeed、XGBoost 等多个生态。Ray 的优势是把分布式计算、数据处理、训练和服务放在同一套运行时中，适合需要弹性资源和复杂 Python 分布式任务的团队。

Kubeflow 是 Kubernetes 上的 AI 平台工具集合。它不替代 PyTorch 或 TensorFlow，而是让训练任务、pipeline、notebook、模型服务、超参搜索等工作负载以 Kubernetes 原生方式运行。企业已有 Kubernetes 基础设施时，Kubeflow 可以把训练任务纳入统一的资源、权限、镜像、调度和运维体系。

TFX 是 TensorFlow 生态下的生产级 ML pipeline。它把数据接入、统计分析、schema 生成、异常检测、特征变换、训练、评估、基础设施验证和推送上线组织成标准组件。对重视数据验证和上线门禁的团队来说，TFX 的价值在于把“训练脚本”提升成“可治理的机器学习流水线”。

MLflow 更偏实验追踪和模型生命周期管理。它能记录参数、指标、产物、模型版本和运行环境，并提供模型注册和部署相关能力。很多团队会把 MLflow 与 PyTorch、TensorFlow、scikit-learn、Hugging Face 或自研训练平台一起使用，用来回答几个关键问题：这个模型是用哪份代码、哪份数据、哪些参数训练出来的？和上一个版本相比好在哪里？能不能回滚？

企业平台的架构通常包含以下部分：

- 任务编排：把数据处理、训练、评估、发布拆成 DAG 或 pipeline。
- 资源调度：决定任务在哪些机器、GPU、队列和命名空间中运行。
- 环境封装：用容器、依赖锁定和镜像版本保证可复现。
- 元数据记录：保存数据版本、代码版本、参数、指标和产物。
- 模型管理：注册模型、审批版本、控制上线和回滚。
- 监控治理：记录失败原因、资源使用、漂移、偏差和线上质量。

这类平台适合企业生产，但不一定适合个人学习。刚开始理解训练时，直接使用 PyTorch 或 Keras 更清楚；当团队需要多人协作、审计和稳定交付时，平台化才会真正发挥价值。

## 前端、端侧与轻量训练框架

还有一类训练框架运行在浏览器、Node.js 或端侧环境里。例如 TensorFlow.js 可以在 JavaScript 中定义、训练和运行模型。它适合教学演示、隐私敏感的小规模端侧学习、交互式原型，或者把模型直接放进 Web 应用中。

不过，前端训练和服务器训练的目标不一样。浏览器里的 WebGPU、WebGL 或 WASM 后端更常用于推理加速，小规模训练可以做，但要训练大型 Transformer、扩散模型或复杂多机任务，仍然需要服务器端框架和专业硬件。端侧训练的关键限制包括显存、功耗、浏览器兼容性、后台运行能力、数据持久化和调试工具。

前端训练框架更适合用作理解训练过程的可视化工具，不适合替代主流训练基础设施。

## 常见模型文件格式

不同框架保存模型的方式也不同。理解文件格式有助于排查“模型为什么加载不了”这类问题。

PyTorch 常见文件扩展名包括 `.pt`、`.pth`、`.bin` 和 `.safetensors`。其中 `.pt`、`.pth` 通常保存模型权重或 checkpoint；`.bin` 在 Hugging Face 早期生态中很常见；`.safetensors` 是更推荐的权重格式，因为它只保存张量数据，不会像 pickle 那样执行任意 Python 代码，安全性更好，加载也更直接。

Python pickle 反序列化时可能执行对象中携带的代码，加载不可信来源的 checkpoint 有安全风险。`safetensors` 的设计目标是只保存张量，不执行任意代码，更适合模型分发和生产加载。即便如此，下载外部模型仍应检查来源、许可、哈希和运行权限。

TensorFlow 常用 SavedModel 格式。它不仅保存权重，还保存计算图、签名和推理入口，适合 TensorFlow Serving、TensorFlow Lite 等部署链路。

Hugging Face 模型目录通常是一组文件，而不是单个文件。例如：

```text
config.json
model.safetensors
tokenizer.json
tokenizer_config.json
generation_config.json
```

`config.json` 描述模型结构，权重文件保存参数，tokenizer 文件决定文本如何变成 token id，generation config 保存默认生成参数。对于语言模型，权重和 tokenizer 必须匹配，否则即使模型能加载，输出也可能异常。

## 不同框架如何选择

框架选型可以从几个维度判断：你是在做研究还是生产？模型是否标准？数据和模型规模多大？团队是否需要统一训练规范？是否需要审计、复现和上线流程？

| 层级 | 代表工具 | 最适合的场景 | 主要优势 | 主要代价 |
| --- | --- | --- | --- | --- |
| 核心框架 | PyTorch | 研究、自定义模型、大模型生态 | 灵活、直观、生态活跃 | 工程规范需要额外建设 |
| 核心框架 | TensorFlow/Keras | 标准训练、完整部署链路、企业应用 | 高层 API 完整，生产和端侧生态成熟 | 自定义复杂训练时抽象较重 |
| 核心框架 | JAX | 高性能研究、函数式数值计算、可组合变换 | `jit`、`grad`、`vmap` 等变换能力强 | 心智模型更陡，工程生态相对小众 |
| 高层封装 | Hugging Face Trainer/Accelerate | 预训练模型微调、多模态模型适配 | 模型生态强，训练路径快 | 特殊训练逻辑可能需要绕开封装 |
| 高层封装 | Lightning/Keras Trainer | 团队标准训练流程 | 结构统一，减少样板代码 | 抽象边界会限制非常规流程 |
| 分布式优化 | DeepSpeed/FSDP/Megatron | 大模型、多机多卡、显存优化 | 能训练更大模型，提高吞吐 | 配置复杂，需要系统理解 |
| 平台 | Ray Train/Kubeflow/TFX/MLflow | 企业训练平台、MLOps、可复现交付 | 调度、追踪、治理、生命周期管理 | 部署和运维成本更高 |
| 前端端侧 | TensorFlow.js | 教学、浏览器原型、小模型端侧训练 | 与 Web 应用集成直接 | 不适合大规模训练 |

如果你是初学者，建议先用 PyTorch 或 Keras 理解训练循环。它们足够接近底层，又不会要求你从零实现矩阵和梯度。

如果你在做预训练模型微调，优先考虑 Hugging Face 生态。它能让你快速复用已有模型、tokenizer、数据处理和训练配置。

如果你在做企业生产，关注点应从“哪一个框架最流行”转向“训练是否可复现、数据是否可追踪、模型是否可治理、上线是否有门禁”。这时 Ray、Kubeflow、TFX、MLflow 或云厂商平台会变得重要。

如果你在做大模型训练，核心问题是显存和通信。你需要理解 FSDP、DeepSpeed、Megatron 这类系统工具，而不只是会写 `loss.backward()`。

## 理解检查

1. 对刚开始学习深度学习训练的读者，最合理的路径是什么？
   - A. 先从 Kubeflow 和 Megatron 开始。
   - B. 先理解 PyTorch/Keras 的训练循环，再学习 Hugging Face 复用预训练模型。
   - C. 只学习 JAX，其他框架都不需要了解。
   - D. 直接学习多机多卡调度，跳过张量和自动微分。

2. DeepSpeed、FSDP、Megatron 这类工具主要解决什么问题？
   - A. 文本分词。
   - B. 大模型训练中的显存、通信和并行效率问题。
   - C. 数据标注质量控制。
   - D. prompt 模板管理。

## 小结

训练框架不是单一概念，而是一组分层工具。PyTorch、TensorFlow、JAX 解决模型表达和自动微分；Keras、Lightning、Hugging Face Trainer 解决训练流程封装；DeepSpeed、FSDP、Megatron 解决大模型训练的显存和并行；Ray、Kubeflow、TFX、MLflow 解决企业生产中的调度、追踪和治理。

理解这些层级之后，框架对比就不再是“谁更强”的争论，而是“当前问题处在哪一层”的判断。小模型学习需要清晰，研究探索需要灵活，业务生产需要稳定，大模型训练需要系统优化。合适的框架，应该服务于你当前的问题规模和团队协作方式。

## 参考资料

- [PyTorch Documentation](https://docs.pytorch.org/docs/stable/)
- [TensorFlow Guide](https://www.tensorflow.org/guide)
- [JAX Documentation](https://docs.jax.dev/)
- [Hugging Face Transformers Documentation](https://huggingface.co/docs/transformers/)
- [DeepSpeed: System Optimizations Enable Training Deep Learning Models with Over 100 Billion Parameters](https://arxiv.org/abs/1910.02054)
