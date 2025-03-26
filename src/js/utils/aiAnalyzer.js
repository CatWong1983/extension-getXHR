// 添加AI分析函数
async function analyzeContent(desc, tags) {
    try {
      const options = {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer sk-dpxngruqnxjukqdixlzhkfflihpmipqtvlxhdmogdcinpeeh',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "Qwen/QwQ-32B",
          messages: [
            {
              role: "user",
              content: `分析内容是否与宝马MINI相关（车型、配置、使用体验、保养维护、改装等）。仅返回如下格式的JSON，reason限制50字内：{"isRelevant":布尔值,"relevanceScore":0到1的数值,"reason":"原因"}
  
  标签：${tags}
  描述：${desc}`
            }
          ],
          stream: false,
          max_tokens: 1024,
          temperature: 0.3,
          top_p: 0.7,
          top_k: 50,
          frequency_penalty: 0.5,
          n: 1,
          response_format: {
            type: "text"
          }
        })
      };
  
      const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', options);
      const result = await response.json();
      
      try {
        let content = result.choices[0].message.content.trim();
        console.log('原始结果:', content);
      
        // 尝试修复不完整的 JSON
        if (content.startsWith('```json')) {
          content = content.replace(/```json\s*/, '').replace(/```\s*$/, '');
        }
        
        // 检查并修复不完整的 JSON
        if (!content.endsWith('}')) {
          const lastBrace = content.lastIndexOf('}');
          if (lastBrace !== -1) {
            // 只有在确实找不到完整的 JSON 时才进行截断
            const beforeBrace = content.substring(0, lastBrace + 1);
            try {
              // 尝试解析截断前的内容
              JSON.parse(beforeBrace);
              content = beforeBrace;
            } catch (e) {
              // 如果解析失败，保留原始内容
              console.log('保留原始响应内容');
            }
          }
        }
  
        console.log('处理后的 AI 响应:', content);
        
        const analysis = JSON.parse(content);
        return {
          isRelevant: analysis.isRelevant,
          score: analysis.relevanceScore,
          reason: analysis.reason || ''
        };
      } catch (parseError) {
        console.error('解析AI响应失败:', parseError);
        console.log('AI原始响应:', result.choices[0].message.content);
        return {
          isRelevant: false,
          score: 0,
          reason: '解析失败'
        };
      }
    } catch (error) {
      console.error('AI分析失败:', error);
      return {
        isRelevant: false,
        score: 0,
        reason: '分析失败'
      };
    }
  }

// 将函数暴露到全局作用域
window.analyzeContent = analyzeContent;