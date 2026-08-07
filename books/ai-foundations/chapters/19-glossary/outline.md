# 术语表

## 本章目标

- 汇总全书关键术语，方便读者回查。
- 补充推理模型、推理时计算、验证器与推理评估指标。
- 用一句话解释每个概念，降低跨章节阅读成本。
- 帮助读者建立术语之间的关系。

## 建议结构

1. 基础概念
   - AI、机器学习、监督学习、无监督学习、自监督学习、强化学习。
   - 训练集、验证集、测试集、泛化、过拟合、欠拟合。
2. 神经网络与训练
   - 参数、权重、偏置、激活函数、前向传播、反向传播。
   - 损失函数、梯度、优化器、学习率、warmup、batch size。
   - Precision、Recall、F1（调和平均与 macro、micro、weighted）、AUC-ROC、MAE、MSE、混淆矩阵。
3. 表征与 Transformer
   - Embedding、向量空间、精确最近邻、ANN、向量索引、向量数据库、HNSW、IVF、PQ、混合检索和重排器。
   - WAL、segment、compaction、shard、replica 和 write-to-search latency。
   - Token、token id、BPE、SentencePiece、attention、Q/K/V、位置编码、Transformer Block。
   - Pre-Norm、Post-Norm、RMSNorm、SwiGLU、MQA、GQA、FlashAttention、MoE。
4. 大语言模型
   - 预训练、上下文窗口、temperature、top-k、top-p、幻觉、prompt、system prompt、结构化输出、function calling、RAG、chunk。
   - Recall@k、Precision@k、MRR、nDCG、groundedness、引用正确率、引用覆盖率、拒答准确率。
5. 推理模型与推理时计算
   - 推理模型、CoT、Self-Consistency、Best-of-N、验证器、ORM、PRM、可验证奖励、GRPO、pass@k、过度思考。
6. 多模态模型
   - VLM、双编码器、视觉编码器、视觉 token、connector、动态分辨率、grounding、多模态 RAG。
7. 微调、对齐与压缩
   - SFT、RLHF、DPO、对齐、蒸馏、量化、剪枝、LoRA、QLoRA。
8. 推理与部署
   - Prefill、decode、KV Cache、TTFT、batching、吞吐和延迟。
   - FSDP、ZeRO、张量并行、流水线并行、safetensors、vLLM、Speculative Decoding。
9. Agent 与工具
   - Agent、Coding Agent、Harness、Plan Mode、Subagent、Background Agent 和 Git Worktree。
   - 意图识别、分层路由、对话行为、槽位、对话状态、OOD、置信校准和精确确认。
   - Run、Run State、运行检查点、interruption、artifact、幂等键。
   - 工具调用、MCP、tools、resources、prompts、skills。
   - 短期/长期记忆、语义/情景/程序性记忆、memory consolidation 和 tombstone。
   - Agent 轨迹、终态评测、过程不变量、pass^k、间接提示注入、confused deputy、策略引擎、副作用。
10. 图像生成
   - 扩散模型、Flow Matching、Rectified Flow、向量场、神经 ODE、DiT。
   - latent space、VAE、seed、采样器、CFG、ControlNet、LoRA、Hypernetwork、ASR、TTS。
11. 风险与能力
   - 提示注入、数据投毒、后门攻击、红队测试、Model Card、数据漂移、可解释性、风险评估、系统思维。

## 实践任务

- 选 10 个术语，用自己的业务场景重新解释一遍。
- 把容易混淆的术语配对比较，例如微调与 RAG、LoRA 与量化、prompt 与上下文工程、subagent 与 Git worktree。

## 本章产出

读者应能快速回忆全书关键术语，并知道每个术语大致属于 AI 系统的哪一层。
