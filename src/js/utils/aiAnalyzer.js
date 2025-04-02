// 添加AI分析函数
async function analyzeContent(content, tags, type = 'note') {
    try {
      let prompt = '';
      if (type === 'note') {
        prompt = `分析内容是否与宝马MINI相关（车型、配置、使用体验、保养维护、改装等）。
仅返回如下格式的JSON，reason限制50字内：
{"isRelevant":布尔值,"relevanceScore":0到1的数值,"reason":"原因"}

标签：${tags}
描述：${content}`;
      } else if (type === 'comment') {
        prompt = `分析此评论是否表明该笔记适合投放宝马MINI广告。考虑以下因素：
1. 评论者对车辆的了解程度和兴趣
2. 评论的正面性和专业度
3. 评论内容的影响力和传播价值
4. 是否能带动品牌曝光

仅返回如下格式的JSON，reason限制50字内：
{"isRelevant":布尔值,"relevanceScore":0到1的数值,"reason":"原因"}

评论内容：${content}`;
      }

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
              content: prompt
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
        console.log( type, '原始结果:', content);
      
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
              console.log(type, '保留原始响应内容');
            }
          }
        }
  
        console.log(type, '处理后的 AI 响应:', content);
        
        const analysis = JSON.parse(content);
        return {
          isRelevant: analysis.isRelevant,
          score: analysis.relevanceScore,
          reason: analysis.reason || ''
        };
      } catch (parseError) {
        console.error(type, '解析AI响应失败:', parseError);
        console.log(type, 'AI原始响应:', result.choices[0].message.content);
        return {
          isRelevant: false,
          score: 0,
          reason: '解析失败'
        };
      }
    } catch (error) {
      console.error(type, 'AI分析失败:', error);
      return {
        isRelevant: false,
        score: 0,
        reason: '分析失败'
      };
    }
}

// 修改获取子评论的函数
// async function fetchSubComments(noteId, commentId, cursor = '', xsecToken) {
//     try {
//       const response = await fetch(
//         `https://edith.xiaohongshu.com/api/sns/web/v2/comment/sub/page?note_id=${noteId}&root_comment_id=${commentId}&num=10&cursor=${cursor}&image_formats=jpg,webp,avif&top_comment_id=&xsec_token=${xsecToken}`
//       );
      
//       if (!response.ok) {
//         throw new Error(`获取子评论失败: ${response.status}`);
//       }
      
//       const data = await response.json();
//       return {
//         comments: data.data.comments || [],
//         cursor: data.data.cursor || '',
//         hasMore: data.data.has_more || false
//       };
//     } catch (error) {
//       console.error('获取子评论失败:', error);
//       return {
//         comments: [],
//         cursor: '',
//         hasMore: false
//       };
//     }
//   }
  
  // 添加评论分析函数
async function analyzeComments(comments) {
  console.log('开始分析评论:', comments);
  if (!comments || !Array.isArray(comments)) {
    console.error('评论数据格式错误:', comments);
    return [{
      comment: '评论分析失败',
      content: '',
      analysis: {
        isRelevant: false,
        score: 0,
        reason: '无有效评论数据'
      },
      commentCount: 0
    }];
  }

  try {
    // 合并所有评论内容
    const combinedContent = comments.map(comment => {
      return `${comment.text}\n`;
    }).join('');

    // 对合并后的评论整体进行分析
    const result = await analyzeContent(combinedContent, '', 'comment');

    // 返回整体分析结果
    return [{
      comment: '评论整体分析',
      content: combinedContent,
      analysis: result,
      commentCount: comments.length
    }];
  } catch (error) {
    console.error('评论分析失败:', error);
    return [];
  }
}
  
//   async function fetchComments(noteId, xsecToken) {
//     let allComments = [];
//     let cursor = '';
//     let hasMore = true;
  
//     try {
//       while (hasMore) {
//         const response = await fetch(
//           `https://edith.xiaohongshu.com/api/sns/web/v2/comment/page?note_id=${noteId}&cursor=${cursor}&top_comment_id=&image_formats=jpg,webp,avif&xsec_token=${xsecToken}`,
//           {
//             headers: {
//               'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
//               'Accept': 'application/json'
//             }
//           }
//         );
        
//         if (!response.ok) {
//           throw new Error(`获取评论失败: ${response.status}`);
//         }
        
//         const data = await response.json();
//         const comments = data.data.comments || [];
        
//         // 处理每条主评论及其子评论
//         for (const comment of comments) {
//           // 存储主评论
//           allComments.push({
//             text: `${comment.user_info.nickname}评论: ${comment.content}`,
//             rawContent: comment.content,
//             type: 'main',
//             likes: comment.like_count,
//             location: comment.ip_location
//           });
          
//           if (comment.sub_comments?.length > 0) {
//             for (const subComment of comment.sub_comments) {
//               allComments.push({
//                 text: `${subComment.user_info.nickname}回复${subComment.target_comment.user_info.nickname}: ${subComment.content}`,
//                 rawContent: subComment.content,
//                 type: 'sub',
//                 likes: subComment.like_count,
//                 location: subComment.ip_location
//               });
//             }
//           }
          
//           if (comment.sub_comment_has_more) {
//             let subCursor = comment.sub_comment_cursor;
//             let hasMoreSub = true;
            
//             while (hasMoreSub) {
//               const subData = await fetchSubComments(noteId, comment.id, subCursor, xsecToken);
              
//               for (const subComment of subData.comments) {
//                 allComments.push({
//                   text: `${subComment.user_info.nickname}回复${subComment.target_comment.user_info.nickname}: ${subComment.content}`,
//                   rawContent: subComment.content,
//                   type: 'sub',
//                   likes: subComment.like_count,
//                   location: subComment.ip_location
//                 });
//               }
              
//               hasMoreSub = subData.hasMore;
//               subCursor = subData.cursor;
//               await new Promise(resolve => setTimeout(resolve, 1000));
//             }
//           }
//         }
        
//         hasMore = data.data.has_more;
//         cursor = data.data.cursor;
        
//         if (hasMore) {
//           await new Promise(resolve => setTimeout(resolve, 1000));
//         }
//       }
      
//       // 使用原始评论内容进行分析
//       const analysisResults = await analyzeComments(allComments);
      
//       return {
//         comments: allComments,
//         analysis: analysisResults
//       };
//     } catch (error) {
//       console.error('获取评论失败:', error);
//       return {
//         comments: [],
//         analysis: []
//       };
//     }
//   }

// 将函数暴露到全局作用域
window.analyzeContent = analyzeContent;
window.analyzeComments = analyzeComments;

