# 模型训练与优化

## 本章目标

- 采用“实际问题—既有方法的难点—技术机制—适用边界”的叙事顺序，避免核心概念直接从定义起笔。
- 理解训练循环的完整过程。
- 掌握 batch、epoch、learning rate、optimizer 等基本概念。
- 认识训练不稳定、过拟合和收敛慢的常见原因。

## 建议结构

1. 训练循环
   - 取 batch。
   - 前向计算预测。
   - 计算 loss。
   - 反向传播梯度。
   - optimizer 更新参数。
   - 梯度累积如何用小 batch 近似大 batch。
2. 数据顺序与随机打乱
   - mini-batch 顺序为什么会改变训练路径。
   - 按类别、难度、领域排序时可能放大差异。
   - 随机打乱数据为什么通常是默认做法。
   - curriculum learning 和领域适配中有意设计顺序的情况。
3. 从手写训练循环到框架训练
   - 无框架时手写前向、梯度和参数更新。
   - PyTorch/TensorFlow/JAX 风格的训练循环。
   - 框架负责张量计算、自动求导、优化器、设备管理和模型保存。
   - 用规模对比表说明单神经元和大模型的共同训练逻辑。
   - 简短展示分类任务中的 sigmoid、softmax 和交叉熵位置。
4. 梯度下降与优化器
   - SGD 的直觉。
   - Momentum、Adam 的改进思路。
   - 学习率为什么通常是最关键超参数。
   - 按数量级试学习率，并观察 loss 曲线。
5. Warmup
   - 为什么训练初期学习率不能过激。
   - 线性 warmup 和后续 decay 的关系。
   - 常见学习率调度策略。
   - 如何从 loss、梯度范数和 NaN 判断 warmup 是否合适。
6. 超参数
   - batch size。
   - epoch。
   - learning rate schedule。
   - weight decay、dropout。
   - 用直觉解释 batch size、epoch、weight decay、dropout 的影响。
7. 训练稳定性
   - 梯度爆炸与梯度消失。
   - 初始化和归一化。
   - 梯度裁剪。
   - 混合精度训练和 loss scaling。
   - 健康和异常 loss 曲线的典型形态。
8. 过拟合与正则化
   - 训练集表现好但测试集差。
   - 数据增强、早停、正则化。
   - Dropout、weight decay、数据增强、早停的直觉类比。
   - 模型规模与数据规模的关系。

## 实践任务

- 写出训练循环伪代码。
- 说明框架中的 `loss.backward()`、`optimizer.step()` 和 `zero_grad()` 分别做什么。
- 解释 learning rate 过大和过小时的表现。
- 解释 warmup 的作用，并判断 warmup 过短或过长的表现。
- 设计一个简单实验观察过拟合。

## 本章产出

读者应能看懂一段基础训练代码，并知道训练失败时从哪些方向排查。
