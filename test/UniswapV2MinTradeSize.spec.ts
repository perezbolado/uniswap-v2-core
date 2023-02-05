import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { solidity, MockProvider, createFixtureLoader } from 'ethereum-waffle'
import { BigNumber, bigNumberify } from 'ethers/utils'

import { expandTo18Decimals, mineBlock, encodePrice } from './shared/utilities'
import { minTradeSizeFixture } from './shared/fixtures'
import { AddressZero } from 'ethers/constants'

const MINIMUM_LIQUIDITY = bigNumberify(10).pow(3)

chai.use(solidity)

const overrides = {
  gasLimit: 9999999
}
interface PairInfo {
  token0Name: string
  token1Name: string
  token0: Contract
  token1: Contract
  token0Amount: BigNumber
  token1Amount: BigNumber
  pair: Contract
}
interface CalculatorInfo {
  expectedAmount:BigNumber
}

describe('UniswapV2MinTradeSize', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999
  })
  const [wallet, other] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet])

  let factory: Contract
  let baseTokens: Array<string>
  let ancilliaryTokens: Array<string>
  let tokenPairs: {[name: string]: {[name: string]:Contract}} 
  let tokens: {[name: string]: Contract} 

  async function getPairInfo(_tokenA:string, _tokenB:string, tokenAAmount: BigNumber, tokenBAmount: BigNumber) : Promise<PairInfo>{
    let info: {[name:string] : {}} ={}
    let tokenA = tokens[_tokenA]
    let tokenB = tokens[_tokenB]
    let pair = tokenPairs[_tokenA][_tokenB]
    let token0Address = (await pair.token0()).address
    let token0 = tokenA.address === token0Address ? tokenA : tokenB
    let token1 = tokenA.address === token0Address ? tokenB : tokenA
    let token0Name = tokenA.address === token0Address ? _tokenA : _tokenB
    let token1Name = tokenA.address === token0Address ? _tokenB : _tokenA
    let token0Amount = tokenA.address === token0Address ? tokenAAmount : tokenBAmount
    let token1Amount = tokenA.address === token0Address ? tokenBAmount : tokenAAmount

    return {token0Name, token1Name, token0,token1,token0Amount, token1Amount, pair}   
  }

  async function addLiquidity( pairInfo:PairInfo) {
    await pairInfo.token0.transfer(pairInfo.pair.address, pairInfo.token0Amount)
    await pairInfo.token1.transfer(pairInfo.pair.address, pairInfo.token1Amount)
    await pairInfo.pair.mint(wallet.address, overrides)
  }

  function calculateOutAmount(amoutInA:BigNumber, reserveA:BigNumber, reserveB:BigNumber ) : BigNumber{
    let amountInWithFee = amoutInA.mul(997)
    let numerator = amountInWithFee.mul(reserveB);
    let denominator = reserveA.mul(1000).add(amountInWithFee);
    let expectedAmount = numerator.div(denominator)
    return expectedAmount
  }

  beforeEach(async () => {
    const fixture = await loadFixture(minTradeSizeFixture)
    factory = fixture.factory
    baseTokens = fixture.baseTokens
    ancilliaryTokens = fixture.ancilliaryTokens
    tokenPairs = fixture.tokenPairs
    tokens = fixture.tokenMap
  })

  it('swap 1000 usd:in | wise:out should passs', async () => {
    const usdReseves = expandTo18Decimals(1)
    const wiseReserves = expandTo18Decimals(7)
    // 1 USD ~ 7 WISE 
    const pairInfo = await getPairInfo('USD','WISE', usdReseves, wiseReserves)
    expect(pairInfo.token1Name).to.eq('USD')
    await addLiquidity(pairInfo)
    const swapUSDAmount = bigNumberify('1000')
    let expectedWISEAmount = calculateOutAmount(swapUSDAmount,usdReseves, wiseReserves)
    await pairInfo.token1.transfer(pairInfo.pair.address, swapUSDAmount)
    await expect(pairInfo.pair.swap(expectedWISEAmount,0, wallet.address, '0x', overrides))
      .to.emit(pairInfo.token0, 'Transfer')
      .withArgs(pairInfo.pair.address, wallet.address, expectedWISEAmount)
      .to.emit(pairInfo.pair, 'Sync')
      .withArgs(pairInfo.token0Amount.sub(expectedWISEAmount), pairInfo.token1Amount.add(swapUSDAmount))
      .to.emit(pairInfo.pair, 'Swap')
      .withArgs(wallet.address, 0, swapUSDAmount, expectedWISEAmount, 0, wallet.address)
  })

  it('swap 999 usd:in | wise:out should be reverted under minimum size', async () => {
    const usdReseves = expandTo18Decimals(1)
    const wiseReserves = expandTo18Decimals(7)
    // 1 USD ~ 7 WISE 
    const pairInfo = await getPairInfo('USD','WISE', usdReseves, wiseReserves)
    expect(pairInfo.token1Name).to.eq('USD')
    await addLiquidity(pairInfo)
    const swapUSDAmount = bigNumberify('999')
    let expectedWISEAmount = calculateOutAmount(swapUSDAmount,usdReseves, wiseReserves)
    await pairInfo.token1.transfer(pairInfo.pair.address, swapUSDAmount)
    await expect(pairInfo.pair.swap(expectedWISEAmount,0, wallet.address, '0x', overrides)).to.be.revertedWith(
      "UniswapV2:UNDER_MINIMUM_SIZE"
    )
  })

  it('swap 1e^18 usd:in | wise:out should pass', async () => {
    const usdReseves = expandTo18Decimals(1)
    const wiseReserves = expandTo18Decimals(7)
    // 1 USD ~ 7 WISE 
    const pairInfo = await getPairInfo('USD','WISE', usdReseves, wiseReserves)
    expect(pairInfo.token1Name).to.eq('USD')
    await addLiquidity(pairInfo)
    const swapUSDAmount = expandTo18Decimals(1)
    let expectedWISEAmount = calculateOutAmount(swapUSDAmount,usdReseves, wiseReserves)
    await pairInfo.token1.transfer(pairInfo.pair.address, swapUSDAmount)
    await expect(pairInfo.pair.swap(expectedWISEAmount,0, wallet.address, '0x', overrides)).to.emit(pairInfo.token0, 'Transfer')
    .withArgs(pairInfo.pair.address, wallet.address, expectedWISEAmount)
    .to.emit(pairInfo.pair, 'Sync')
    .withArgs(pairInfo.token0Amount.sub(expectedWISEAmount), pairInfo.token1Amount.add(swapUSDAmount))
    .to.emit(pairInfo.pair, 'Swap')
    .withArgs(wallet.address, 0, swapUSDAmount, expectedWISEAmount, 0, wallet.address)
  })

  
  it('swap usd:out | 7500 wise:in should pass', async () => {
    const usdReseves = expandTo18Decimals(1)
    const wiseReserves = expandTo18Decimals(7)
    // 1 USD ~ 7 WISE 
    const pairInfo = await getPairInfo('USD','WISE', usdReseves, wiseReserves)
    expect(pairInfo.token1Name).to.eq('USD')
    expect(pairInfo.token0Name).to.eq('WISE')
    await addLiquidity(pairInfo)
    const swapWISEAmount = bigNumberify(7500)
    await pairInfo.token0.transfer(pairInfo.pair.address, swapWISEAmount)
    let expectedUSDAmount = calculateOutAmount(swapWISEAmount, wiseReserves, usdReseves)

    await expect(pairInfo.pair.swap(0, expectedUSDAmount, wallet.address, '0x', overrides))
      .to.emit(pairInfo.token1, 'Transfer')
      .withArgs(pairInfo.pair.address, wallet.address, expectedUSDAmount)
      .to.emit(pairInfo.pair, 'Sync')
      .withArgs(pairInfo.token0Amount.add(swapWISEAmount), pairInfo.token1Amount.sub(expectedUSDAmount))
      .to.emit(pairInfo.pair, 'Swap')
      .withArgs(wallet.address, swapWISEAmount, 0, 0, expectedUSDAmount, wallet.address)

  });

  it('swap usd:out | 6500 wise:in should be reverted', async () => {
    const usdReseves = expandTo18Decimals(1)
    const wiseReserves = expandTo18Decimals(7)
    // 1 USD ~ 7 WISE 
    const pairInfo = await getPairInfo('USD','WISE', usdReseves, wiseReserves)
    expect(pairInfo.token1Name).to.eq('USD')
    expect(pairInfo.token0Name).to.eq('WISE')
    await addLiquidity(pairInfo)
    const swapWISEAmount = bigNumberify(6500)
    await pairInfo.token0.transfer(pairInfo.pair.address, swapWISEAmount)
    let expectedUSDAmount = calculateOutAmount(swapWISEAmount, wiseReserves, usdReseves)

    await expect(pairInfo.pair.swap(0, expectedUSDAmount, wallet.address, '0x', overrides)).to.be.revertedWith(
      "UniswapV2:UNDER_MINIMUM_SIZE"
    )
  });
  
})
