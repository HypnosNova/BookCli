# AI 绘画：从噪声到图像

## 本章目标

- 采用“实际问题—既有方法的难点—技术机制—适用边界”的叙事顺序，避免核心概念直接从定义起笔。
- 理解扩散模型为什么可以从随机噪声生成图像。
- 理解 Flow Matching、Rectified Flow、扩散路径与 DiT 的关系。
- 掌握 prompt、seed、采样器、步数、CFG 等参数在生成流程中的作用。
- 能解释文生图、图生图、局部重绘和 ControlNet 的基本区别。

## 建议结构

1. 扩散模型的基本直觉
   - 正向加噪。
   - 反向去噪。
   - 训练和生成的关系。
   - 训练时如何随机选择时间步、加噪、预测噪声并计算损失。
   - 正向加噪的极简公式直觉。
2. Flow Matching 与 Rectified Flow
   - 从噪声分布到数据分布的连续运输。
   - 在随机时间点回归向量场的训练目标。
   - 生成时求解神经 ODE。
   - Flow Matching、Rectified Flow 与扩散模型的联系和区别。
   - Flow Matching 是训练框架，DiT 是网络骨干。
   - 路径、模型误差、solver 与步数的质量—成本取舍。
3. 用户输入如何进入模型
   - prompt token 化。
   - 文本编码器。
   - 正向提示词和负向提示词。
   - U-Net、cross-attention 和 DiT 的结构直觉。
4. 从随机种子到初始噪声
   - seed 的作用。
   - latent space。
   - latent space 是压缩图像描述空间。
   - VAE decoder。
5. 一步一步去噪
   - 构图先形成。
   - 轮廓和主体稳定。
   - 细节和纹理补充。
6. 采样器与采样步数
   - 不同采样路径。
   - 步数不足和步数过多的问题。
7. CFG
   - 提示词约束强度。
   - 过低和过高的表现。
   - CFG 是 prompt 对去噪方向的拉力。
   - negative prompt 是软约束而不是硬删除。
   - 固定 seed 后微调参数的实用技巧。
8. 可控生成
   - img2img。
   - inpainting。
   - ControlNet。
9. 常见模型与插件格式
   - checkpoint/base model。
   - LoRA 与 embedding。
   - VAE、ControlNet、IP-Adapter、Hypernetwork。
   - 不同格式解决的问题。
   - 写实人像和动漫插画的典型组合工作流。
10. 常见失败原因
   - 手部结构。
   - 文字渲染。
   - 复杂空间关系。
11. 视频生成的延伸
   - 视频是相关图片帧序列。
   - 帧间一致性和时序 attention。
12. 语音与音频 AI 简介
   - ASR：语音识别。
   - TTS：语音合成。
   - 语音克隆、音频生成和实时语音 Agent。
   - 识别准确率、合成自然度、延迟、隐私和授权风险。
13. 图像生成如何评估
   - FID、CLIP Score 和人工评估。
   - GAN 与扩散模型的历史对比。
14. 常见工具生态
   - ComfyUI、Automatic1111。
   - Midjourney、DALL-E、Ideogram。
   - SDXL、Stable Diffusion 3、Flux 等模型生态。
15. 训练阶段学到了什么
   - 训练数据和文本描述如何形成视觉模式。
   - 训练 LoRA 的基本流程和过拟合风险。
16. 完整生成流程
   - 从用户点击生成到最终图片。

## 实践任务

- 用同一个 prompt 和不同 seed 生成多张图，观察构图差异。
- 固定 seed 后调整 CFG，比较画面服从 prompt 和自然度的变化。
- 用 img2img 或局部重绘修改一张已有图，观察 denoise strength 的影响。
- 比较 checkpoint、LoRA 和 embedding 分别改变了画面的哪一部分。
- 拆解一个生成模型的空间、骨干、训练目标、求解器和条件控制。
- 固定 prompt 与 seed，比较 Flow / Rectified Flow 模型在不同采样步数下的质量和耗时。

## 本章产出

读者应能解释扩散去噪与 Flow Matching 向量场两种生成表述，并说明文本条件、DiT 或 U-Net、VAE 与采样求解器各自位于哪一层。
