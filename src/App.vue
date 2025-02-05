<template>
  <el-container class="app-container">
    <el-header class="app-header">
      <h1>Kaleido挂机脚本</h1>
    </el-header>
    
    <el-main>
      <el-row :gutter="20">
        <el-col :span="8">
          <el-card class="wallet-manager">
            <template #header>
              <div class="card-header">
                <span>钱包管理</span>
                <el-button type="primary" @click="showAddWalletDialog">添加钱包</el-button>
              </div>
            </template>
            
            <el-table :data="wallets" style="width: 100%">
              <el-table-column prop="address" label="钱包地址" width="220">
                <template #default="{ row }">
                  <el-text class="mx-1" truncated>{{ row.address }}</el-text>
                </template>
              </el-table-column>
              <el-table-column prop="status" label="状态" width="100">
                <template #default="{ row }">
                  <el-tag :type="row.isActive ? 'success' : 'info'">
                    {{ row.isActive ? '运行中' : '已停止' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="180">
                <template #default="{ row }">
                  <div class="button-group">
                    <el-button 
                      :type="row.isActive ? 'danger' : 'success'"
                      size="small"
                      @click="toggleMining(row)"
                    >
                      {{ row.isActive ? '停止' : '启动' }}
                    </el-button>
                    <el-button 
                      type="danger" 
                      size="small"
                      @click="removeWallet(row)"
                    >
                      删除
                    </el-button>
                  </div>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>
        
        <el-col :span="16">
          <el-card class="mining-stats">
            <template #header>
              <div class="card-header">
                <span>挖矿状态</span>
                <div>
                  <el-button type="success" @click="startAllMining">一键启动</el-button>
                  <el-button type="danger" @click="stopAllMining">一键停止</el-button>
                </div>
              </div>
            </template>
            
            <el-table :data="miningStats" style="width: 100%">
              <el-table-column prop="address" label="钱包地址" width="220" />
              <el-table-column prop="hashrate" label="算力 (MH/s)" width="120" />
              <el-table-column prop="totalEarned" label="总收益" width="120" />
              <el-table-column prop="pendingRewards" label="待领取" width="120" />
              <el-table-column prop="uptime" label="运行时间" width="120" />
              <el-table-column prop="efficiency" label="效率" width="100">
                <template #default="{ row }">
                  <el-progress 
                    :percentage="row.efficiency * 100" 
                    :status="row.efficiency >= 0.8 ? 'success' : 'warning'"
                  />
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>
      </el-row>
    </el-main>
    
    <!-- 添加钱包对话框 -->
    <el-dialog
      v-model="addWalletDialogVisible"
      title="添加钱包"
      width="30%"
    >
      <el-form :model="newWallet" label-width="120px">
        <el-form-item label="钱包地址">
          <el-input v-model="newWallet.address" placeholder="请输入EVM钱包地址" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="addWalletDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="addWallet">确认</el-button>
        </span>
      </template>
    </el-dialog>
  </el-container>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'

const wallets = ref([])
const miningStats = ref([])
const addWalletDialogVisible = ref(false)
const newWallet = ref({ address: '' })

// 格式化运行时间
const formatUptime = (startTime) => {
  const seconds = Math.floor((Date.now() - startTime) / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${minutes}m`
}

// 从本地存储加载钱包列表
onMounted(() => {
  const savedWallets = localStorage.getItem('wallets')
  if (savedWallets) {
    wallets.value = JSON.parse(savedWallets)
  }

  // 监听挖矿状态更新
  const unsubscribe = window.electronAPI.onMinerStatusUpdate(({ wallet, status }) => {
    const statIndex = miningStats.value.findIndex(s => s.address === wallet)
    if (statIndex > -1) {
      miningStats.value[statIndex] = { 
        ...status, 
        address: wallet,
        startTime: status.isActive ? (miningStats.value[statIndex].startTime || Date.now()) : null
      }
    } else {
      miningStats.value.push({ 
        ...status, 
        address: wallet,
        startTime: status.isActive ? Date.now() : null
      })
    }
  })

  // 每秒更新运行时间
  const timer = setInterval(() => {
    miningStats.value.forEach(stat => {
      if (stat.isActive && stat.startTime) {
        stat.uptime = formatUptime(stat.startTime)
      }
    })
  }, 1000)

  // 组件卸载时清理
  onUnmounted(() => {
    if (unsubscribe) unsubscribe()
    clearInterval(timer)
  })
})

// 添加钱包
const addWallet = () => {
  if (!newWallet.value.address.startsWith('0x')) {
    ElMessage.error('请输入有效的EVM钱包地址')
    return
  }
  
  wallets.value.push({
    address: newWallet.value.address,
    isActive: false
  })
  
  // 保存到本地存储
  localStorage.setItem('wallets', JSON.stringify(wallets.value))
  
  addWalletDialogVisible.value = false
  newWallet.value.address = ''
  ElMessage.success('钱包添加成功')
}

// 移除钱包
const removeWallet = (wallet) => {
  const index = wallets.value.findIndex(w => w.address === wallet.address)
  if (index > -1) {
    wallets.value.splice(index, 1)
    localStorage.setItem('wallets', JSON.stringify(wallets.value))
    ElMessage.success('钱包已移除')
  }
}

// 切换单个钱包挖矿状态
const toggleMining = async (wallet) => {
  try {
    if (wallet.isActive) {
      const result = await window.electronAPI.stopMining([wallet.address])
      if (result.success) {
        wallet.isActive = false
        ElMessage.success('挖矿已停止')
      } else {
        ElMessage.error('停止失败：' + result.error)
      }
    } else {
      const result = await window.electronAPI.startMining([wallet.address])
      if (result.success) {
        wallet.isActive = true
        ElMessage.success('挖矿已启动')
      } else {
        ElMessage.error('启动失败：' + result.error)
      }
    }
  } catch (error) {
    ElMessage.error('操作失败：' + error.message)
  }
}

// 一键启动所有钱包挖矿
const startAllMining = async () => {
  try {
    const inactiveWallets = wallets.value.filter(w => !w.isActive).map(w => w.address)
    if (inactiveWallets.length === 0) {
      ElMessage.warning('没有需要启动的钱包')
      return
    }
    
    const result = await window.electronAPI.startMining(inactiveWallets)
    if (result.success) {
      wallets.value.forEach(wallet => {
        if (inactiveWallets.includes(wallet.address)) {
          wallet.isActive = true
        }
      })
      ElMessage.success('所有钱包已启动挖矿')
    } else {
      ElMessage.error('启动失败：' + result.error)
    }
  } catch (error) {
    ElMessage.error('启动失败：' + error.message)
  }
}

// 一键停止所有钱包挖矿
const stopAllMining = async () => {
  try {
    const activeWallets = wallets.value.filter(w => w.isActive).map(w => w.address)
    if (activeWallets.length === 0) {
      ElMessage.warning('没有正在运行的钱包')
      return
    }
    
    const result = await window.electronAPI.stopMining(activeWallets)
    if (result.success) {
      wallets.value.forEach(wallet => {
        if (activeWallets.includes(wallet.address)) {
          wallet.isActive = false
        }
      })
      ElMessage.success('所有钱包已停止挖矿')
    } else {
      ElMessage.error('停止失败：' + result.error)
    }
  } catch (error) {
    ElMessage.error('停止失败：' + error.message)
  }
}

// 显示添加钱包对话框
const showAddWalletDialog = () => {
  addWalletDialogVisible.value = true
}
</script>

<style>
.app-container {
  height: 100vh;
}

.app-header {
  background-color: #409EFF;
  color: white;
  display: flex;
  align-items: center;
  padding: 0 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.wallet-manager, .mining-stats {
  margin-bottom: 20px;
}

.el-table {
  margin-top: 20px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.button-group {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style> 