# 训练框架与工程平台

## 本章目标

- 理解训练框架解决的工程问题。
- 区分核心深度学习框架、高层训练封装、分布式优化库和企业级训练平台。
- 对比 PyTorch、TensorFlow/Keras、JAX、Hugging Face、Lightning、DeepSpeed、FSDP、Ray、Kubeflow、TFX、MLflow 等工具的定位和架构差异。
- 建立根据任务规模、团队协作和生产要求选择框架的判断方法。

## 建议结构

1. 初学者阅读指引
   - 先关注 PyTorch/Keras 和 Hugging Face。
   - DeepSpeed、FSDP、平台工具等到遇到对应问题时再深入。
   - 新手路径：核心训练循环 -> 预训练模型推理/微调 -> 分布式和平台化。
2. 训练框架到底帮我们做什么
   - 张量计算。
   - 自动微分。
   - 模型抽象。
   - 训练循环。
   - 分布式与生产能力。
3. 四层架构
   - 核心深度学习框架。
   - 高层训练封装。
   - 大模型分布式优化库。
   - 企业级训练平台和 MLOps。
   - 用“初学者需要关心吗”表格降低学习负担。
4. PyTorch
   - 动态图和 Pythonic 开发体验。
   - autograd、nn、optim、data、distributed、compile。
   - 灵活性和工程规范的权衡。
5. TensorFlow 与 Keras
   - 高层训练 API。
   - tf.data、Distribution Strategies、SavedModel、TFX。
   - 完整生产链路和抽象成本。
6. JAX
   - 函数式编程。
   - grad、jit、vmap、pmap。
   - 编译优化和学习曲线。
   - 初学者可以先跳过，等有研究或高性能计算需求再深入。
7. Hugging Face 生态
   - Transformers、Datasets、Tokenizers、Trainer、Accelerate、PEFT。
   - 预训练模型微调的产品化路径。
   - 最小 Transformers 推理代码示例。
8. 高层训练封装
   - Lightning、Keras Trainer。
   - 回调、日志、检查点、多卡训练。
9. 大模型训练优化
   - DeepSpeed、FSDP、Megatron。
   - ZeRO、分片、张量并行、流水线并行。
   - 用 100GB 模型和 40GB GPU 的例子解释 FSDP 分片。
10. 企业生产平台
   - Ray Train、Kubeflow、TFX、MLflow。
   - 调度、追踪、治理、模型生命周期。
11. 前端和端侧训练
    - TensorFlow.js。
    - 浏览器训练的适用边界。
12. 常见模型文件格式
    - PyTorch `.pt`、`.pth`、`.bin`、`.safetensors`。
    - safetensors 相比 pickle 的安全性。
    - TensorFlow SavedModel。
    - Hugging Face 的 `config.json`、权重文件、tokenizer 文件。
13. 如何选择框架
    - 按研究、微调、生产、大模型、教学场景选择。

## 实践任务

- 为一个个人学习项目、一个企业风控模型、一个大模型 LoRA 微调项目分别选择训练技术栈。
- 画出“核心框架、高层封装、分布式优化、平台”四层架构图。
- 比较 PyTorch 自定义训练循环和 Hugging Face Trainer 在灵活性上的差异。

## 本章产出

读者应能理解不同训练框架和平台的定位差异，并能根据任务复杂度、模型规模和生产要求做出合理选型。
