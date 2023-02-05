import { Contract, Wallet } from 'ethers'
import { Web3Provider } from 'ethers/providers'
import { deployContract } from 'ethereum-waffle'

import { expandTo18Decimals } from './utilities'

import ERC20 from '../../build/ERC20.json'
import UniswapV2Factory from '../../build/UniswapV2Factory.json'
import UniswapV2Pair from '../../build/UniswapV2Pair.json'

interface FactoryFixture {
  factory: Contract
}

const overrides = {
  gasLimit: 9999999
}

export async function factoryFixture(_: Web3Provider, [wallet]: Wallet[]): Promise<FactoryFixture> {
  const factory = await deployContract(wallet, UniswapV2Factory, [wallet.address], overrides)
  return { factory }
}

interface PairFixture extends FactoryFixture {
  token0: Contract
  token1: Contract
  pair: Contract
}

interface minTradeSizeFixture extends FactoryFixture {
  baseTokens: Array<string>
  ancilliaryTokens: Array<string>
  tokenMap: {[name: string]: Contract}
  tokenPairs: {[name: string]: {[name: string]:Contract}} 
}

export async function pairFixture(provider: Web3Provider, [wallet]: Wallet[]): Promise<PairFixture> {
  const { factory } = await factoryFixture(provider, [wallet])

  const tokenA = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)], overrides)
  const tokenB = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)], overrides)

  await factory.createPair(tokenA.address, tokenB.address, 0, 0, overrides)
  const pairAddress = await factory.getPair(tokenA.address, tokenB.address)
  const pair = new Contract(pairAddress, JSON.stringify(UniswapV2Pair.abi), provider).connect(wallet)

  const token0Address = (await pair.token0()).address
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  return { factory, token0, token1, pair }
}

export async function minTradeSizeFixture(provider: Web3Provider, [wallet]: Wallet[]): Promise<minTradeSizeFixture> {
  const { factory } = await factoryFixture(provider, [wallet])
  const baseTokens = ['USD']
  const ancilliaryTokens = ['WISE', 'DAI', 'ELON']

  let tokenMap: {[name: string]: Contract} = {}
  let tokenPairsAddress : {[name: string]: {[name: string]:string}} = {}
  let tokenPairs : {[name: string]: {[name: string]:Contract}} = {}

  let allTokens = baseTokens.concat(ancilliaryTokens)
  tokenMap['USD'] = await deployContract(wallet,ERC20, [expandTo18Decimals(1000)], overrides)
  tokenMap['WISE'] = await deployContract(wallet,ERC20, [expandTo18Decimals(1000)], overrides)
  tokenMap['DAI'] = await deployContract(wallet,ERC20, [expandTo18Decimals(1000)], overrides)
  tokenMap['ELON'] = await deployContract(wallet,ERC20, [expandTo18Decimals(1000)], overrides)

  await factory.createPair(tokenMap['USD'].address, tokenMap['WISE'].address, 1000, 0, overrides)
  await factory.createPair(tokenMap['USD'].address, tokenMap['DAI'].address, 1000, 0, overrides)
  await factory.createPair(tokenMap['USD'].address, tokenMap['ELON'].address, 1000, 0, overrides)

  tokenPairsAddress['USD'] ={}
  tokenPairsAddress['USD']['WISE'] = await factory.getPair(tokenMap['USD'].address, tokenMap['WISE'].address)
  tokenPairsAddress['USD']['DAI'] = await factory.getPair(tokenMap['USD'].address, tokenMap['DAI'].address)
  tokenPairsAddress['USD']['ELON'] = await factory.getPair(tokenMap['USD'].address, tokenMap['ELON'].address)
  
  tokenPairs['USD']={}
  tokenPairs['USD']['WISE'] = new Contract(tokenPairsAddress['USD']['WISE'] , JSON.stringify(UniswapV2Pair.abi), provider).connect(wallet)
  tokenPairs['USD']['DAI'] = new Contract(tokenPairsAddress['USD']['DAI'], JSON.stringify(UniswapV2Pair.abi), provider).connect(wallet)
  tokenPairs['USD']['ELON'] = new Contract(tokenPairsAddress['USD']['ELON'], JSON.stringify(UniswapV2Pair.abi), provider).connect(wallet)

  return { factory, baseTokens, ancilliaryTokens, tokenMap, tokenPairs }
}



