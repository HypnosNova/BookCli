# 第20章（术语表）审阅记录

## 已覆盖内容

- 训练、评估、Transformer、LLM、推理模型、多模态、微调、部署、Agent、图像生成和风险术语。
- 精确最近邻、ANN、向量索引、向量数据库、HNSW、IVF、PQ、混合检索和重排器。
- WAL、segment、compaction、shard、replica 和 write-to-search latency 等向量数据库内部术语。
- RAG、chunk、检索和引用评测术语。
- Run、Run State、运行检查点、interruption、artifact 和幂等键。
- Coding Agent、Plan Mode、Subagent、Background Agent 与 Git Worktree。
- 短期/长期以及语义/情景/程序性记忆、consolidation 和 tombstone。
- 客服 Agent 的意图识别、分层路由、对话行为、槽位、对话状态、OOD、置信校准和精确确认。

## 本轮审校处理

- 扩展 F1 定义，补充调和平均、混淆矩阵等价公式、不计入真负例和多分类平均方式。
- 区分“运行检查点”和“模型 Checkpoint”，避免同名术语跨章节混淆。
- 扩展 RAG 定义，明确检索不只来自向量数据库。
- 扩展记忆定义，加入作用域、来源、更新和删除治理。
- 补齐第 7、9、16 章新增概念并保持一句话可回查。
- 补齐第 7 章向量数据库原理新增术语，区分分片扩容与副本容错。
- 补齐第 16 章产品比较所需的产品无关术语，并明确 worktree 是写入隔离机制而不是安全沙箱。
- 补齐第 17 章客服 Agent 工程化术语，并强调分类分数不等于执行授权。

## 后续维护注意事项

- 新增缩写时优先同时给出英文全称、中文解释和所在系统层。
- 产品名不宜作为通用术语；确需收录时注明它是实现而不是原理。
- 定期用各章二、三级标题和加粗定义反查术语遗漏。
